/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) JTSage <https://github.com/jtsage/osc-proxy-spy> */
// TCP Transport Framing

const SLIP_END = 0xc0
const SLIP_ESC = 0xdb
const SLIP_ESC_END = 0xdc
const SLIP_ESC_ESC = 0xdd

export function encodePacketLength( oscBuffer : Buffer<ArrayBufferLike> ) : Buffer<ArrayBufferLike> {
	const frame = Buffer.allocUnsafe( 4 + oscBuffer.length )
	frame.writeUInt32BE( oscBuffer.length, 0 )
	oscBuffer.copy( frame, 4 )
	return frame
}

export function encodeSLIP( oscBuffer : Buffer<ArrayBufferLike> ) : Buffer<ArrayBufferLike> {
	let returnBuffer = Buffer.alloc( 0 )

	if ( oscBuffer.indexOf( SLIP_END ) === -1 && oscBuffer.indexOf( SLIP_ESC ) === -1 ) {
		return Buffer.concat( [oscBuffer, Buffer.from( [SLIP_END] )] )
	}

	for ( const byte of oscBuffer ) {
		if ( byte === SLIP_END ) {
			returnBuffer = Buffer.concat( [returnBuffer, Buffer.from( [SLIP_ESC, SLIP_ESC_END] )] )
		} else if ( byte === SLIP_ESC ) {
			returnBuffer = Buffer.concat( [returnBuffer, Buffer.from( [SLIP_ESC, SLIP_ESC_ESC] )] )
		} else {
			returnBuffer = Buffer.concat( [returnBuffer, Buffer.from( [byte] )] )
		}
	}
	return Buffer.concat( [returnBuffer, Buffer.from( [SLIP_END] )] )
}


export class TCPTransportDecoder {
	#buffer    : Buffer = Buffer.alloc( 0 )
	#onMessage : ( oscBuffer : Buffer ) => void
	#useSlip   : boolean = false
	escape     : boolean = false
	start      : boolean = false

	constructor( onMessage : ( oscBuffer : Buffer ) => void, version : '1.0' | '1.1' = '1.0' ) {
		this.#onMessage = onMessage
		this.#useSlip   = version === '1.1'
	}

	#processSLIP() {
		while ( this.#buffer.length !== 0 ) {
			let isEscaped = false

			const endPosition = this.#buffer.indexOf( SLIP_END )

			if ( endPosition === -1 ) {
				break // Wait for more data
			}

			const payload = this.#buffer.subarray( 0, endPosition )

			let returnBuffer = Buffer.alloc( 0 )

			this.#buffer = this.#buffer.subarray( endPosition )

			for ( let byte of payload ) {
				if ( isEscaped && byte === SLIP_ESC_ESC ) { // esc esc
					byte = SLIP_ESC
					isEscaped = false
				} else if ( isEscaped && byte === SLIP_ESC_END ) { // esc end
					byte = SLIP_END
					isEscaped = false
				} else if ( byte === SLIP_ESC ) { // escape
					isEscaped = true
					continue
				} else if ( byte === SLIP_END ) { // unexpected end
					break
				}

				returnBuffer = Buffer.concat( [returnBuffer, Buffer.from( [byte] )] )
			}

			this.#onMessage( returnBuffer )
		}
	}

	#processPacketLength() {
		while ( this.#buffer.length >= 4 ) {
			const messageLength = this.#buffer.readUInt32BE( 0 )

			// Check if we have the complete message
			if ( this.#buffer.length < 4 + messageLength ) {
				break // Wait for more data
			}

			// Extract the message payload
			const payload = this.#buffer.subarray( 4, 4 + messageLength )

			// Remove processed bytes from buffer
			this.#buffer = this.#buffer.subarray( 4 + messageLength )

			// Emit the complete message
			this.#onMessage( payload )
		}
	}

	// Consume incoming data
	consume( tcpData : Buffer ) : void {
		// Append new data to existing buffer
		this.#buffer = Buffer.concat( [this.#buffer, tcpData] )

		if ( this.#useSlip ) {
			this.#processSLIP()
		} else {
			this.#processPacketLength()
		}
	}

	// Reset parser state
	reset() : void { this.#buffer = Buffer.alloc( 0 ) }
}