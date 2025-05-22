<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/state";
    import { goto } from "$app/navigation";
    import { WEBSOCKET_URL } from "$lib/constants.js";
    import WebSocketClient, { streamResolve } from "./webSocketFunctions.js";
    import type StreamEntry from "./types";
    import type { ScreenShareEntry } from "./types";
    import { createVideoElement } from "./mediaFunctions.js";
    const ROOM_ID = page.params.room

    // const ws = new WebSocket(WEBSOCKET_URL);
    const ws = new WebSocket(''); // for testing purposes
    const peers: {[key: string]: RTCPeerConnection} = {};
    let docRef: HTMLDivElement | null = $state(null);
    let streams: StreamEntry[] = $state([]);
    let isOwner: any = $state({status: true});

    $inspect(streams);

    const currentScreenShare: ScreenShareEntry = {
        stream: new MediaStream(),
        id: 'none',
        active: false
    }

    let wsc = new WebSocketClient(ws, peers, streams, docRef, isOwner);

    ws.onopen = () => {
        wsc.onOpen(ROOM_ID);
    }

    ws.onmessage = (event: any) => {
        wsc.onMessage(event);
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
        console.log('starting camera');
        console.log(stream);

        return stream;
    }

    /**
     * start screensharing, push the stream onto the
     * list of streams that the wsc already has
     */
    async function startScreenShare() {
        const stream = await navigator.mediaDevices.getDisplayMedia();
        console.log('starting screenshare');
        console.log(stream);

        currentScreenShare.stream = stream;
        currentScreenShare.id = 'my-screenshare';
        currentScreenShare.active = true;
        streams.push(currentScreenShare);

        //stream.oninactive does exist, idk why typescript does not recognize that
        //@ts-ignore
        stream.oninactive = () => {
            const myScreenshare = document.querySelector('#user-my-screenshare');
            myScreenshare?.remove();
        }

        wsc.addMediaStream(stream);
    }

    /**
     * Close all connections, close webcsocket, leave
     */
    function leave() {
        Object.values(peers).forEach(p => {
            p.close();
        });

        ws.close();
        goto('/');
    }

    /**
    * modify the DOM whenever a new stream appears
    */ 
    $effect(() => {
        console.log('new stream appeared!');
        if (!docRef) {
            return;
        }

        for (const stream of streams) {
            console.log(stream.stream);
            //check if the box exists already
            const streamId = stream.id;
            const ele = docRef.querySelector(`#user-${streamId}`);
            if (ele) { continue; }

            const container = createVideoElement(stream.id, stream.stream);
            docRef.appendChild(container);
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
        if (!docRef) {
            return;
        }

        const video = document.querySelector('video');
        startCamera(video).then((mediaStream) => {
            wsc.stream = mediaStream || null;
            streamResolve(mediaStream || new MediaStream());
            streams.push({
                stream: mediaStream || new MediaStream(),
                id: 'hello'
            });
            streams.push({
                stream: mediaStream || new MediaStream(),
                id: 'hello'
            });
            streams.push({
                stream: mediaStream || new MediaStream(),
                id: 'hello'
            });
            streams.push({
                stream: mediaStream || new MediaStream(),
                id: 'hello'
            });
            streams.push({
                stream: mediaStream || new MediaStream(),
                id: 'hello'
            });
        });

        return () => {
            Object.values(peers).forEach(p => {
                p.close();
            });

            wsc.stream?.getTracks().forEach((t) => {
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
        background-color: white;
        align-items: start;
    }

    .svg-wrapper {
        height: 9rem;
        background-color: white;
    }

    .header {
        background-color: rgb(47, 47, 47);
        color: white;
        display: flex;
        padding-top: 1em;
    }

    .header-left {
        font-size: 2em;
        font-weight: 600;
        padding-left: 1em;
        cursor: pointer;
    }

    .header-right {
        flex: 1;
        display: flex;
        justify-content: flex-end;
        padding-right: 1em;
        gap: 1em;
        align-items: center;
    }

    :global(.screenshare) {
        transform: scaleX(1);
        width: 100%;
        position: relative;
    }

    :global(.video) {
        width: 100%;
        transform: scaleX(-1);
        position: relative;
    }

    :global(.video-entry) {
        position: relative;
        /* height: auto; */
    }

    :global(.video-text) {
        position: absolute;
        background-color: rgba(47, 47, 47, 0.5);
        bottom: 4px;
        right: 0;
        font-size: 0.5rem;
        padding: 0.1rem 0.2rem 0.1rem 0.2rem;
    }
</style>


<div>
    <div class="header">
        <a class="header-left" onclick={leave}>
            Peter's Zoom.
        </a>
        <div class="header-right">
            <button onclick={startScreenShare}>
                start screen sharing
            </button>
            <div>
                Your room: {ROOM_ID}
            </div>
            {#if isOwner.status}
                <button>
                    End call
                </button>
            {/if}
        </div>
    </div>
    <div class="svg-wrapper">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320">
            <path fill="rgb(47, 47, 47)" fill-opacity="1" d="M0,160L34.3,149.3C68.6,139,137,117,206,117.3C274.3,117,343,139,411,149.3C480,160,549,160,617,149.3C685.7,139,754,117,823,112C891.4,107,960,117,1029,112C1097.1,107,1166,85,1234,85.3C1302.9,85,1371,107,1406,117.3L1440,128L1440,0L1405.7,0C1371.4,0,1303,0,1234,0C1165.7,0,1097,0,1029,0C960,0,891,0,823,0C754.3,0,686,0,617,0C548.6,0,480,0,411,0C342.9,0,274,0,206,0C137.1,0,69,0,34,0L0,0Z"></path>
        </svg>
    </div>

    <!-- video elements will be added/removed dynamically down here as things change -->
    <div class="video-container" bind:this={docRef}>
        <div class="video-entry">
            <video class="video" autoplay>
                <track kind="captions">
            </video>
            <div class="video-text">
                {ROOM_ID}
            </div>
        </div>
    </div>
</div>