<script lang="ts">
    interface StreamEntry {
        id: string,
        stream: MediaStream
    }

    import { onMount } from "svelte";

    const ws = new WebSocket('ws://localhost:8080');
    const peers: {[key: string]: RTCPeerConnection} = {};
    let id: string;
    let stream: MediaStream | null;
    let docRef: HTMLDivElement | null;
    const streams: StreamEntry[] = $state([]);

    let streamResolve: (s: MediaStream) => void;
    const streamReady = new Promise<MediaStream>((resolve) => { streamResolve = resolve; });

    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'join'
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
            if ((pc.connectionState === "disconnected" || pc.connectionState === "failed") && to) {
                delete peers[to];
                //dont worry about checking the user here, entire page will be gone
                streams.filter((s) => s.id != to);
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

    $effect(() => {
        if (!docRef) {
            return;
        }

        for (const stream of streams) {
            const videoDiv = document.createElement('video');
            videoDiv.srcObject = stream.stream;
            docRef.appendChild(videoDiv);
            videoDiv.play();
        }

        return;
    });

    onMount(async () => {
        const video = document.querySelector('video');
        stream = await startCamera(video) || null;
        if (stream) {
            streamResolve(stream);
        }
    });
</script>


<div bind:this={docRef}>
    <video autoplay style="transform: scaleX(-1)">
        <track kind="captions">
    </video>
</div>