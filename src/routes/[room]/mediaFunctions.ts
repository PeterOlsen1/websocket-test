export function createVideoElement(id: string, stream: MediaStream): [HTMLDivElement, HTMLVideoElement] {
    const entry: HTMLDivElement = document.createElement('div');
    entry.className = "video-entry";
    entry.id = `user-${id}`;

    const v: HTMLVideoElement = document.createElement('video');
    v.srcObject = stream;
    v.className = `${id.includes('-screenshare') ? 'screenshare' : 'video'}`;

    const text = document.createElement('div');
    text.innerText = id;
    text.className = 'video-text';

    entry.appendChild(v);
    entry.appendChild(text);
    return [entry, v];
}