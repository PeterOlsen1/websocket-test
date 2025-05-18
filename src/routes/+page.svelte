<script lang="ts">
    import { onMount } from "svelte";

    let responses = $state([""]);
    let message = $state('');
    let username = $state('');
    let videoDiv: HTMLVideoElement | null = $state(null);
    let remoteVideo: HTMLVideoElement | null = $state(null);
    let peer: RTCPeerConnection;
    let isBroadcaster: boolean = $state(false);
    let id;

    let iceQueue: RTCIceCandidate[] = [];
    let remoteDescriptionSet = false;

    const ws = new WebSocket('ws://localhost:8080');
    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'join'
        }));
    }
    ws.onmessage = async (event: any) => {
        const data = JSON.parse(event.data);
        console.log(data);
        if (data.type == 'message') {
            responses.push(`${data.sender}: ${data.message}`);
        }
        
        if (data.type == 'error') {
            console.error(data.error);
        }

        if (data.type === "offer" && !isBroadcaster) {
            peer = createPeer();
            await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
            remoteDescriptionSet = true;

            // Flush any queued ICE candidates
            for (const candidate of iceQueue) {
                await peer.addIceCandidate(candidate);
            }
            iceQueue = [];

            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: "answer", answer }));
        }

        if (data.type === "answer" && isBroadcaster) {
            await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
            remoteDescriptionSet = true;

            // Flush queued ICE
            for (const candidate of iceQueue) {
                await peer.addIceCandidate(candidate);
            }
            iceQueue = [];
        }

        if (data.type === "ice") {
            if (data.from == id) {
                //don't send ice candidates to yourself
                return;
            }

            //ice candidate sent to server, throw it in the queue
            const candidate = new RTCIceCandidate(data.ice);
            if (remoteDescriptionSet) {
                await peer.addIceCandidate(candidate);
            } else {
                iceQueue.push(candidate);
            }
        }

        if (data.type == 'join') {
            isBroadcaster = data.broadcaster;
            id = data.id;
            console.log('starting stuff');
            start();
        }
    }

    async function start() {
        peer = createPeer();

        if (isBroadcaster && videoDiv) {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            videoDiv.srcObject = stream;

            stream.getTracks().forEach(track => {
                peer.addTrack(track, stream);
            });

            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);

            ws.send(JSON.stringify({ type: "offer", offer }));
        }
    }

    //create ice candidates
    function createPeer() {
        const config = {
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        };
        const pc = new RTCPeerConnection(config);
    
        //send ice candidate to other users
        pc.onicecandidate = (e) => {
            if (e.candidate) {
                ws.send(JSON.stringify({ type: "ice", ice: e.candidate }));
            }
        };

        pc.ontrack = (e) => {
            remoteVideo.srcObject = e.streams[0];
        };

        return pc;
    }

    //send a message to the socket server
    function sendMessage() {
        ws.send(JSON.stringify({
            "type": "message",
            "message": message
        }));
        message = "";
    }

    //update username to the socket server
    function sendUsername() {
        ws.send(JSON.stringify({
            "type": "username",
            "username": username
        }));
    }
</script>

<div>
    <div>
        Change your username:
        <input type="text" bind:value={username} 
            onkeypress={(e: KeyboardEvent) => 
                e.key == 'Enter' && username && sendUsername()
            }
        >
        <button onclick={() => 
            username && sendUsername()
        }>
            change user
        </button>
    </div>
    <br>
    <div>
        Send a message:
        <input type="text" bind:value={message} onkeypress={(e: KeyboardEvent) => 
            e.key == 'Enter' && message && sendMessage()
        }>
        <button onclick={() => {
            message && sendMessage()
        }}>
            send your message
        </button>
    </div>

    <br><br>
    response:
    <br>
    {#each responses as resp}
        {resp}
        <br>
    {/each}

    <br>
    {#if isBroadcaster}
        you are the broadcaster!
        <br>
    {/if}
    <video bind:this={videoDiv} style="transform: scaleX(-1)" autoplay></video>
    <video bind:this={remoteVideo} style="transform: scaleX(-1)" autoplay></video>
    <br>
</div>