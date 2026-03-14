export async function playAudio(inlineData: { mimeType?: string, data?: string }): Promise<AudioBufferSourceNode> {
  if (!inlineData.data) throw new Error("No audio data");
  const binaryString = atob(inlineData.data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  try {
    // Try standard decoding first (if it's WAV/MP3)
    // We slice the buffer because decodeAudioData might detach it
    const bufferCopy = bytes.buffer.slice(0);
    const audioBuffer = await audioCtx.decodeAudioData(bufferCopy);
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.start();
    return source;
  } catch (e) {
    // Fallback to raw 16-bit PCM at 24000Hz (typical for Gemini TTS)
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }
    const audioBuffer = audioCtx.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.start();
    return source;
  }
}
