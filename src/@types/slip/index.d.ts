declare module 'slip' {
	export type DecoderOptions = {
		onMessage      : ( msg : Uint8Array ) => void,
		maxMessageSize : number,
		bufferSize     : number,
	}
	export class Decoder {
		constructor( options : DecoderOptions )
		decode( b : Buffer<ArrayBufferLike> | Uint8Array ) : void
	}
	export function encode( b : Buffer<ArrayBufferLike> | Uint8Array ) : Uint8Array
}