export default interface StreamEntry {
    id: string,
    stream: MediaStream
}

export interface ScreenShareEntry extends StreamEntry {
    id: string,
    stream: MediaStream,
    active: boolean
}