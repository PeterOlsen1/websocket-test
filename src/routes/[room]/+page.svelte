<script lang="ts">
    import { onMount } from "svelte";
    import { WEBSOCKET_URL, INVALID_ROOM_ERR } from "$lib/constants";
    import { page } from "$app/state";
    import { goto } from "$app/navigation";
    const ROOM_ID = page.params.room

    interface StreamEntry {
        id: string,
        stream: MediaStream
    }

    const ws = new WebSocket(WEBSOCKET_URL);
    const peers: {[key: string]: RTCPeerConnection} = {};
    let id: string;
    let stream: MediaStream | null;
    let docRef: HTMLDivElement | null;
    let streams: StreamEntry[] = $state([]);

    let streamResolve: (s: MediaStream) => void;
    const streamReady = new Promise<MediaStream>((resolve) => { streamResolve = resolve; });

    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'join',
            roomId: ROOM_ID
        }));
    }

    ws.onmessage = async (event: any) => {
        let data;
        try {
            data = JSON.parse(event.data);
        }
        catch (e) {
            console.error('failed to parse JSON');
            console.error(e);
            return;
        }

        if (data.type == 'error') {
            console.error("Encountered error! \n" + data.error);

            if (data.error == INVALID_ROOM_ERR) {
                alert("Room is not valid!");
                goto('/');
            }
            return;
        }
        else if (data.type == 'join' && !id) { //current user does not have ID yet
            id = data.id;
            console.log("First join! Our ID is: " + id);
            console.log(data.users);

            //create connections with all of the current active users
            data.users?.forEach((u: string) => {
                newUser(u);
            });
        }
        else if (data.type == 'join') { // new user joined
            if (!data.id) {
                console.error("User joined with no ID!");
                return;
            }
            console.log("New user joined: " + data.id);

            if (!stream) {
                console.error("Media stream has not been started yet!");
                return;
            }

            //call function to start new user operations
            // newUser(data.id);
        }
        else if (data.type == 'ice') {
            if (data.from == id || !data.from) {
                return;
            }

            const cand = new RTCIceCandidate(data.ice);
            const pc = peers[data.from];
            if (!pc) {
                return;
            }

            await pc.addIceCandidate(cand);
        }
        else if (data.type == 'offer') {
            if (!data.from) {
                console.error("Offer does not contain from attribute!");
                return;
            }

            let pc = peers[data.from];
            if (!pc) { //this client did not initiate a connection, it needs to create a peer connection
                pc = await start(data.from);

                //add tracks from the stream so that both parties can get them
                stream?.getTracks().forEach((t) => {
                    pc.addTrack(t, stream as MediaStream);
                });
                peers[data.from] = pc;
            }

            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: 'answer', answer, to: data.from }));
        }
        else if (data.type == 'answer') {
            if (!data.from) {
                console.error("Answer does not contain from attribute!");
                return;
            }

            const pc = peers[data.from];
            if (!pc) {
                console.error("Peer connection not found! (answer)");
                return;
            }

            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    }

    /**
     * Startup function for a new user join,
     * set up a remote connection and send office
     * 
     * @param userId
     */
    async function newUser(userId: string) {    
        const pc = await start(userId);
        peers[userId] = pc;

        //wait for stream if it is not defined by this point
        if (!stream) { 
            console.log('stream not ready yet');
            await streamReady; 
        }

        //stream will not be null, we already checked earlier
        //@ts-ignore
        stream.getTracks().forEach((track) => {
            pc.addTrack(track, stream as MediaStream);
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "offer", offer, to: userId }));
    }

    /**
     * Start function, return a new peer connection
     */
    async function start(to: string | null = null) {
        const config = {
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        };
        const pc = new RTCPeerConnection(config);

        pc.onicecandidate = (ev: RTCPeerConnectionIceEvent) => {
            if (ev.candidate) {
                const obj = {
                    type: "ice",
                    ice: ev.candidate
                }
                if (to) {
                    //@ts-ignore
                    obj.to = to;
                }

                ws.send(JSON.stringify(obj));
            }
        }

        pc.ontrack = (ev: RTCTrackEvent) => {
            streams.push({
                id: to || id,
                stream: ev.streams[0]
            });
        }

        pc.onconnectionstatechange = () => {
            if (pc.connectionState == 'connecting') {
                const loadingDiv = document.createElement('div');
                loadingDiv.className = 'loader';
                loadingDiv.id = `loading-${to}`;
                docRef?.appendChild(loadingDiv);
            }
            else if (pc.connectionState == 'connected') {
                const loader = docRef?.querySelector(`#loading-${to}`);
                loader?.remove();
            }
            else if ((pc.connectionState === "disconnected" || pc.connectionState === "failed") && to) {
                delete peers[to];
                //dont worry about checking the main id here, entire page will be gone if they leave
                const videoDiv = document.querySelector(`#user-${to}`);
                videoDiv?.remove();
                streams = streams.filter((s) => s.id != to);
            }
        }

        return pc;
    }

    /**
     * Start the camera and return a media stream
     */
    async function startCamera(videoElement: HTMLVideoElement | null) {
        if (!videoElement) {
            return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({video: true});
        videoElement.srcObject = stream;

        return stream;
    }

    /**
    * modify the DOM whenever a new stream appears
    */ 
    $effect(() => {
        if (!docRef) {
            return;
        }

        for (const stream of streams) {
            //check if the box exists already
            const streamId = stream.id;
            const ele = docRef.querySelector(`#user-${streamId}`);
            if (ele) { continue; }

            const videoDiv = document.createElement('video');
            videoDiv.id = `user-${streamId}`;
            videoDiv.className = 'video';
            videoDiv.srcObject = stream.stream;
            docRef.appendChild(videoDiv);
            videoDiv.play();
        }

        return;
    });

    /**
     * start video, return function to close connections
     * 
     * use .then so that the function isnt async and we
     * can appease the ts gods
    */
    onMount(() => {
        const video = document.querySelector('video');
        startCamera(video).then((mediaStream) => {
            stream = mediaStream || null;
            if (stream) {
                streamResolve(stream);
            }
        });

        return () => {
            for (const id of Object.keys(peers)) {
                const pc = peers[id];
                pc.close();
            }
            stream?.getTracks().forEach((t) => {
                t.stop();
            });
        };
        });
</script>

<style>
    .video-container {
        width: 100%;
        height: 100vh;
        display: grid;
        grid-template-columns: repeat(5, 1fr);
    }

    :global(.video) {
        width: 100%;
        /* height: 25vh; */
        transform: scaleX(-1);
    }
</style>


<div>
    <div class="video-container" bind:this={docRef}>
        <video class="video" autoplay>
            <track kind="captions">
        </video>
    </div>
</div>