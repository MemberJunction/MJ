/**
 * The largest message a carrier media socket accepts (64 KiB). A 20 ms audio frame is a few hundred bytes
 * (Twilio sends it as base64 in JSON, Vonage as binary PCM), and the control frames are small JSON.
 * A larger message closes the socket with 1009 while it is read.
 */
export const MEDIA_SOCKET_MAX_MESSAGE_BYTES = 64 * 1024;
