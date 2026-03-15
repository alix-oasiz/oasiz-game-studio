type AudioWindow = Window & {
    webkitAudioContext?: typeof AudioContext;
};

let sharedAudioContext: AudioContext | undefined;

export function getSharedAudioContext(): AudioContext | undefined {

    if (sharedAudioContext) {
        return sharedAudioContext;
    }

    const audioWindow = window as AudioWindow;
    const AudioCtor = window.AudioContext ?? audioWindow.webkitAudioContext;

    if (!AudioCtor) {
        return undefined;
    }

    sharedAudioContext = new AudioCtor();
    return sharedAudioContext;
}
