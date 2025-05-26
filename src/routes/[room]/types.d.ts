export interface StreamEntry {
    id: string,
    stream: MediaStream
}

export interface ScreenShareEntry extends StreamEntry {
    id: string,
    stream: MediaStream,
    active: boolean
}


export enum MediaType {
    SCREENSHARE = "screenshare",
    VIDEO = "video",
    AUDIO = "audio"
}