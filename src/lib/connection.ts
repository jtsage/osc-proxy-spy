/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) JTSage <https://github.com/jtsage/osc-proxy-spy> */

import { Logger, MainLogger } from './logger'
import dgram                  from 'node:dgram'
import EventEmitter           from 'node:events'
import net                    from 'node:net'
import * as slip              from 'protocol-slip'
import { OSCMessage, OSCArgObject, OSCPacket, OSCBundle, OSCBundleMessage } from 'simple-osc-lib'
import { OSCMessageObject } from 'simple-osc-lib/type'


type IPv4Address = string & { readonly __brand : unique symbol }
type IPv4Port    = number & { readonly __brand : unique symbol }

function isIPv4( ip : string ) : ip is IPv4Address {
	if ( net.isIPv4( ip ) ) {
		return true
	}
	throw new ConnectionError( 'invalid ip address' )
}

function isIPv4Port( port : number ) : port is IPv4Port {
	if ( Number.isInteger( port ) && port > 1023 && port < 65536 ) {
		return true
	}
	throw new ConnectionError( 'invalid port' )
}

// MARK: Event Types
export type OSCListenEvent = {
	bundleTime : number | boolean | null,
	message    : OSCMessageObject,
	timestamp  : number,
	name       : string,
	address    : string,
	port       : number
}

export type OSCListenEventPart = {
	bundleTime : number | boolean | null,
	timestamp  : number,
	name       : string,
	address    : string,
	port       : number
}

export type OSCListenFreqEvent = {
	average   : number,
	ever      : boolean,
	name      : string,
	since     : number,
	tcpStatus : boolean | null,
}

// MARK: UDPSender
export type UDPSenderDef = {
	sendAddress : string,
	sendPort    : number,
	type        : 'sender',
}

export class UDPSender {
	sendAddress ! : IPv4Address
	log           : Logger
	sendPort    ! : IPv4Port

	constructor( config : UDPSenderDef, logger : Logger ) {
		if ( typeof logger !== 'object' ) {
			throw new ConnectionError( 'logger needed' )
		}
		this.log = logger

		try {
			if ( isIPv4( config.sendAddress ) ) {
				this.sendAddress = config.sendAddress
			}
			if ( isIPv4Port( config.sendPort ) ) {
				this.sendPort = config.sendPort
			}
		} catch( err ) {
			if ( err instanceof ConnectionError ) {
				this.log.error( err.message )
				throw new ConnectionError( `unable to create UDPSender connection :: ${err.message}` )
			}
			throw err
		}
	}

	send( buffer : Buffer<ArrayBufferLike> ) {
		const client = dgram.createSocket( 'udp4' )

		if ( !Buffer.isBuffer( buffer ) || buffer.length === 0 ) {
			this.log.warn( `send to ${this.sendAddress}:${this.sendPort} failed :: empty or non-buffer` )
			return
		}

		client.send( buffer, 0, buffer.length, this.sendPort, this.sendAddress, ( err ) => {
			if ( err ) {
				this.log.warn( `send to ${this.sendAddress}:${this.sendPort} failed :: ${err.message}` )
			}
			client.close()
		} )
	}

	isSender()    : this is UDPSender   { return true }
	isListener()  : this is UDPListener { return false}
	isBoth()      : this is UDPBoth     { return false}
	isTCPClient() : this is TCPClient   { return false}

	toJSON() : UDPSenderDef {
		return {
			sendAddress : this.sendAddress,
			sendPort    : this.sendPort,
			type        : 'sender',
		}
	}
}

// MARK : UDPListener
type OSCListenerCallback = ( b : Buffer<ArrayBufferLike> ) => void

export type UDPListenerDef = {
	listenAddress : string,
	listenPort    : number,
	type          : 'listen'
}

export class UDPListener {
	#lastSix        : number[] = []
	#socket         : dgram.Socket | null = null
	callback        : OSCListenerCallback
	enabled         : boolean = true
	listenAddress ! : IPv4Address
	listenPort    ! : IPv4Port
	log             : Logger

	constructor( enabled : boolean, config : UDPListenerDef, logger : Logger, callback : OSCListenerCallback ) {
		if ( typeof logger !== 'object' ) {
			throw new ConnectionError( 'logger needed' )
		}
		if ( ! ( typeof callback === 'function' ) ) {
			throw new ConnectionError( 'callback needed' )
		}
		this.callback = callback
		this.log      = logger
		this.enabled  = enabled

		try {
			if ( isIPv4( config.listenAddress ) ) {
				this.listenAddress = config.listenAddress
			}
			if ( isIPv4Port( config.listenPort ) ) {
				this.listenPort = config.listenPort
			}
		} catch( err ) {
			if ( err instanceof ConnectionError ) {
				this.log.error( err.message )
				throw new ConnectionError( `unable to create UDPSender connection :: ${err.message}` )
			}
			throw err
		}

		this.open()
	}

	close() {
		if ( this.#socket !== null ) {
			this.#socket.close()
			this.#socket = null
		}
	}

	open() {
		this.#lastSix.length = 0
		if ( !this.enabled ) {
			return
		}
		this.#socket = dgram.createSocket( { type : 'udp4', reuseAddr : true } )

		this.#socket.on( 'message', ( buffer ) => {
			if ( this.#lastSix.length > 20 ) {
				this.#lastSix.shift()
			}
			this.#lastSix.push( ( new Date() ).getTime() )
			this.callback( buffer )
		} )

		this.#socket.on( 'error', ( err ) => {
			this.log.error( `socket error, closing :: ${err.message}` )
			this.close()
		} )

		this.#socket.on( 'listening', () => { this.log.info( 'connection opened' ) } )

		try {
			this.#socket.bind( this.listenPort, this.listenAddress )
		} catch( err ) {
			if ( err instanceof Error ) {
				this.log.error( `connection bind error :: ${err.message}` )
			} else {
				this.log.error( 'connection bind error :: unknown' )
			}
			this.#socket = null
		}
	}

	get sinceEver() { return this.#lastSix.length !== 0 }
	get sinceLast() {
		if ( this.#lastSix.length === 0 ) {
			return Infinity
		}
		return ( new Date() ).getTime() - this.#lastSix[this.#lastSix.length - 1]
	}

	get frequency() {
		if ( this.#lastSix.length < 2 ) {
			return 0
		}
		const lenMinOne = this.#lastSix.length - 1
		return this.#lastSix.length / ( ( this.#lastSix[lenMinOne] - this.#lastSix[0] ) / 1000 )
	}

	isSender()    : this is UDPSender   { return false }
	isListener()  : this is UDPListener { return true  }
	isBoth()      : this is UDPBoth     { return false }
	isTCPClient() : this is TCPClient   { return false}
	ok()         : boolean { return this.#socket !== null }

	send( _buffer : Buffer<ArrayBufferLike> ) { this.log.warn( 'attempt to send to listener only failed' ) }

	toJSON() : UDPListenerDef {
		return {
			listenAddress : this.listenAddress,
			listenPort    : this.listenPort,
			type          : 'listen',
		}
	}
}

//MARK: UDPBoth

export type UDPBothDef = {
	listenAddress : string,
	listenPort    : number,
	sendAddress   : string,
	sendPort      : number,
	type          : 'both'
}

export class UDPBoth {
	#lastSix        : number[] = []
	#sharedPort     : boolean = false
	#socket         : dgram.Socket | null = null
	callback        : OSCListenerCallback
	enabled         : boolean = true
	listenAddress ! : IPv4Address
	listenPort    ! : IPv4Port
	sendAddress   ! : IPv4Address
	sendPort      ! : IPv4Port
	log             : Logger

	constructor( enabled : boolean, config : UDPBothDef, logger : Logger, callback : OSCListenerCallback ) {
		if ( typeof logger !== 'object' ) {
			throw new ConnectionError( 'logger needed' )
		}
		if ( ! ( typeof callback === 'function' ) ) {
			throw new ConnectionError( 'callback needed' )
		}
		this.callback = callback
		this.log      = logger
		this.enabled  = enabled

		try {
			if ( isIPv4( config.listenAddress ) ) {
				this.listenAddress = config.listenAddress
			}
			if ( isIPv4Port( config.listenPort ) ) {
				this.listenPort = config.listenPort
			}
			if ( isIPv4( config.sendAddress ) ) {
				this.sendAddress = config.sendAddress
			}
			if ( isIPv4Port( config.sendPort ) ) {
				this.sendPort = config.sendPort
			}
		} catch( err ) {
			if ( err instanceof ConnectionError ) {
				this.log.error( err.message )
				throw new ConnectionError( `unable to create UDPSender connection :: ${err.message}` )
			}
			throw err
		}

		if ( this.listenPort === this.sendPort ) {
			this.#sharedPort = true
		}

		this.open()
	}

	close() {
		if ( this.#socket !== null ) {
			this.#socket.close()
			this.#socket = null
		}
	}

	open() {
		this.#lastSix.length = 0
		if ( !this.enabled ) {
			return
		}
		this.#socket = dgram.createSocket( { type : 'udp4', reuseAddr : true } )

		this.#socket.on( 'message', ( buffer ) => {
			if ( this.#lastSix.length > 20 ) {
				this.#lastSix.shift()
			}
			this.#lastSix.push( ( new Date() ).getTime() )
			this.callback( buffer )
		} )

		this.#socket.on( 'error', ( err ) => {
			this.log.error( `socket error, closing :: ${err.message}` )
			this.close()
		} )

		this.#socket.on( 'listening', () => { this.log.info( 'connection opened' ) } )

		try {
			this.#socket.bind( this.listenPort, this.listenAddress )
		} catch( err ) {
			if ( err instanceof Error ) {
				this.log.error( `connection bind error :: ${err.message}` )
			} else {
				this.log.error( 'connection bind error :: unknown' )
			}
			this.#socket = null
		}
	}

	get sinceEver() { return this.#lastSix.length !== 0 }
	get sinceLast() {
		if ( this.#lastSix.length === 0 ) {
			return Infinity
		}
		return ( new Date() ).getTime() - this.#lastSix[this.#lastSix.length - 1]
	}

	get frequency() {
		if ( this.#lastSix.length < 2 ) {
			return 0
		}
		const lenMinOne = this.#lastSix.length - 1
		return this.#lastSix.length / ( ( this.#lastSix[lenMinOne] - this.#lastSix[0] ) / 1000 )
	}

	isSender()    : this is UDPSender   { return false}
	isListener()  : this is UDPListener { return false}
	isBoth()      : this is UDPBoth     { return true}
	isTCPClient() : this is TCPClient   { return false}
	ok()         : boolean { return this.#socket !== null }

	send( buffer : Buffer<ArrayBufferLike> ) {
		if ( this.#sharedPort === false ) {
			const client = dgram.createSocket( 'udp4' )

			if ( !Buffer.isBuffer( buffer ) || buffer.length === 0 ) {
				this.log.warn( `send to ${this.sendAddress}:${this.sendPort} failed :: empty or non-buffer` )
				return
			}

			client.send( buffer, 0, buffer.length, this.sendPort, this.sendAddress, ( err ) => {
				if ( err ) {
					this.log.warn( `send to ${this.sendAddress}:${this.sendPort} failed :: ${err.message}` )
				}
				client.close()
			} )
		} else if ( this.#socket !== null ) {
			this.#socket.send( buffer, 0, buffer.length, this.sendPort, this.sendAddress, ( err ) => {
				if ( err ) {
					this.log.warn( `send to ${this.sendAddress}:${this.sendPort} failed :: ${err.message}` )
				}
			} )
		} else {
			this.log.warn( `send to ${this.sendAddress}:${this.sendPort} failed :: socket not open` )
		}
	}

	toJSON() : UDPBothDef {
		return {
			listenAddress : this.listenAddress,
			listenPort    : this.listenPort,
			sendAddress   : this.sendAddress,
			sendPort      : this.sendPort,
			type          : 'both',
		}
	}
}

//MARK: TCP encode/decode

function TCPDecodePL( b : string | Buffer<ArrayBufferLike>, log : Logger ) : Buffer<ArrayBufferLike> {
	const decodeBuffer  = ( typeof b === 'string' ) ? Buffer.from( b ) : b
	const definedLength = decodeBuffer.subarray( 0, 4 ).readInt32BE()
	if ( decodeBuffer.length !== definedLength + 4 ) {
		log.info( `discarding malformed packet, expected : ${definedLength + 4} , actual ${decodeBuffer.length}` )
		return Buffer.alloc( 0 )
	}
	return decodeBuffer.subarray( 4 )
}

function TCPEncodePL( b : Buffer<ArrayBufferLike> ) {
	const lenBuffer = Buffer.alloc( 4 )
	lenBuffer.writeInt32BE( b.length )
	return Buffer.concat( [lenBuffer, b] )
}

function TCPDecodeSLIP( b : string | Buffer<ArrayBufferLike> ) : Buffer<ArrayBufferLike> {
	const decodeBuffer  = ( typeof b === 'string' ) ? Buffer.from( b ) : b
	const decoded = [...slip.decode( [decodeBuffer] )]
	return decoded[0]
}

function TCPEncodeSLIP( b : Buffer<ArrayBufferLike> ) {
	const encoded = [...slip.encode( [b] )]
	return encoded[0]
}

//MARK: TCPClient

export type TCPClientDef = {
	sendAddress : string,
	sendPort    : number,
	spec        : '1.0' | '1.1',
	type        : 'tcp-client'
}

export class TCPClient {
	#lastSix        : number[] = []
	#client         : net.Socket | null = null
	#ready          : boolean = false
	#spec         ! : '1.0' | '1.1'
	callback        : OSCListenerCallback
	enabled         : boolean = true
	sendAddress   ! : IPv4Address
	sendPort      ! : IPv4Port
	log             : Logger
	retryAttempts   : number = 0
	retryTimeout    : ReturnType<typeof setTimeout> | null = null

	constructor( enabled : boolean, config : TCPClientDef, logger : Logger, callback : OSCListenerCallback ) {
		if ( typeof logger !== 'object' ) {
			throw new ConnectionError( 'logger needed' )
		}
		if ( ! ( typeof callback === 'function' ) ) {
			throw new ConnectionError( 'callback needed' )
		}
		this.callback = callback
		this.log      = logger
		this.enabled  = enabled
		this.#spec    = config.spec

		try {
			if ( isIPv4( config.sendAddress ) ) {
				this.sendAddress = config.sendAddress
			}
			if ( isIPv4Port( config.sendPort ) ) {
				this.sendPort = config.sendPort
			}
		} catch( err ) {
			if ( err instanceof ConnectionError ) {
				this.log.error( err.message )
				throw new ConnectionError( `unable to create TCPClient connection :: ${err.message}` )
			}
			throw err
		}

		this.open()
	}

	close() {
		if ( this.#client !== null ) {
			this.#client.end()
			this.#ready = false
		}
	}

	open() {
		this.#lastSix.length = 0
		this.retryAttempts++

		if ( !this.enabled ) {
			return
		}
		try {
			this.#client = net.createConnection( this.sendPort, this.sendAddress )

			this.#client.on( 'data', ( buffer ) => {
				if ( this.#lastSix.length > 20 ) {
					this.#lastSix.shift()
				}
				this.#lastSix.push( ( new Date() ).getTime() )

				this.callback( this.#spec === '1.0' ?
					TCPDecodePL( buffer, this.log ) :
					TCPDecodeSLIP( buffer )
				)
			} )

			this.#client.on( 'error', ( err ) => {
				this.log.error( `client error, closing :: ${err.message}` )
				this.#ready = false
				this.close()
				if ( this.retryAttempts > 20 ) {
					this.log.error( 'Reconnect failed 20+ times, not retrying' )
				} else if ( this.retryAttempts > 5 ) {
					this.log.info( 'Retry connect in 2min...' )
					this.retryTimeout = setTimeout( () => { this.open() }, 120000 )
				} else {
					this.log.info( 'Retry connect in 15secs...' )
					this.retryTimeout = setTimeout( () => { this.open() }, 15000 )
				}
			} )

			this.#client.on( 'end', () => {
				this.log.info( 'connection closed' )
				this.#ready = false
			} )

			this.#client.on( 'connect', () => {
				this.retryAttempts = 0
				this.log.info( 'connection opened' )
				this.#ready = true
			} )

		} catch( err ) {
			if ( err instanceof Error ) {
				this.log.error( `connection bind error :: ${err.message}` )
			} else {
				this.log.error( 'connection bind error :: unknown' )
			}
			this.#client = null
		}

	}

	get sinceEver() { return this.#lastSix.length !== 0 }
	get sinceLast() {
		if ( this.#lastSix.length === 0 ) {
			return Infinity
		}
		return ( new Date() ).getTime() - this.#lastSix[this.#lastSix.length - 1]
	}

	get frequency() {
		if ( this.#lastSix.length < 2 ) {
			return 0
		}
		const lenMinOne = this.#lastSix.length - 1
		return this.#lastSix.length / ( ( this.#lastSix[lenMinOne] - this.#lastSix[0] ) / 1000 )
	}

	isSender()    : this is UDPSender   { return false}
	isListener()  : this is UDPListener { return false}
	isBoth()      : this is UDPBoth     { return false}
	isTCPClient() : this is TCPClient  { return true}
	// isTCPServer() : this is TCPServer  { return false}

	ok()         : boolean { return this.#ready }

	send( buffer : Buffer<ArrayBufferLike> ) {
		if ( this.#ready === true && this.#client?.writable ) {
			this.#client.write( this.#spec === '1.0' ?
				TCPEncodePL( buffer ) :
				TCPEncodeSLIP( buffer )
			)
		} else {
			this.log.warn( `send to ${this.sendAddress}:${this.sendPort} failed :: socket not open` )
		}
	}

	toJSON() : TCPClientDef {
		return {
			sendAddress   : this.sendAddress,
			sendPort      : this.sendPort,
			spec          : this.#spec,
			type          : 'tcp-client',
		}
	}
}

// MARK: ConnectionDef
export type ConnectionDefTypes = UDPListenerDef | UDPSenderDef | UDPBothDef | TCPClientDef
export type ConnectionDef = {
	connectionPrime      : ConnectionDefTypes
	enabled              : boolean
	forwarders           : UDPSenderDef[]
	name                 : string
	oscHeartBeatAddress  : string | null
	oscHeartBeatArgs     : OSCArgObject[]
	oscHeartBeatEnabled  : boolean
	oscHeartBeatInterval : number | null
}

// MARK: Connection
export class Connection extends EventEmitter {
	#heartbeatBuffer     : Buffer<ArrayBufferLike> | null = null
	#heartbeatInterval   : ReturnType<typeof setInterval> | null = null
	#log                 : Logger
	connectionPrime      : UDPListener | UDPSender | UDPBoth | TCPClient
	enabled              : boolean = true
	forwarders           : UDPSender[] = []
	name                 : string
	oscHeartBeatEnabled  : boolean = false
	oscHeartBeatAddress  : string | null = null
	oscHeartBeatArgs     : OSCArgObject[] = []
	oscHeartBeatInterval : number | null = null

	toJSON() : ConnectionDef {
		return {
			connectionPrime      : this.connectionPrime.toJSON(),
			enabled              : this.enabled,
			forwarders           : this.forwarders.map( ( item ) => item.toJSON() ),
			name                 : this.name,
			oscHeartBeatAddress  : this.oscHeartBeatAddress,
			oscHeartBeatArgs     : this.oscHeartBeatArgs,
			oscHeartBeatEnabled  : this.oscHeartBeatEnabled,
			oscHeartBeatInterval : this.oscHeartBeatInterval,
		}
	}

	#emitMessage( v : OSCListenEvent ) { this.emit( 'message', v ) }

	#unwrapPacket( v : OSCMessage | OSCBundle | OSCBundleMessage, emitObj : OSCListenEventPart ) {
		if ( Buffer.isBuffer( v ) ) {
			return
		}
		if ( v instanceof OSCMessage ) {
			this.#emitMessage( {
				...emitObj,
				message    : v.toJSON(),
			} )
		}
		if ( v instanceof OSCBundle ) {
			const bundleEmitObj = {
				...emitObj,
				bundleTime : ( v.timeTag.value[0] === 0 && v.timeTag.value[1] === 1 ) ? null : ( v.timeTag.asDate ).getTime(),
			}
			for ( const item of v.messages ) { this.#unwrapPacket( item, bundleEmitObj ) }
		}
	}

	oscInputCallback( b : Buffer<ArrayBufferLike> ) {
		if ( Buffer.isBuffer( b ) && b.length !== 0 ) {
			for ( const forwarder of this.forwarders ) { forwarder.send( b ) }
		}
		if ( this.connectionPrime.isListener() || this.connectionPrime.isBoth()  || this.connectionPrime.isTCPClient() ) {
			try {
				const message = OSCPacket.fromBuffer( b )

				const emitObj = {
					address    : this.connectionPrime.isTCPClient() ? this.connectionPrime.sendAddress : this.connectionPrime.listenAddress,
					bundleTime : false,
					name       : this.name,
					port       : this.connectionPrime.isTCPClient() ? this.connectionPrime.sendPort : this.connectionPrime.listenPort,
					timestamp  : ( new Date() ).getTime(),
				}

				this.#unwrapPacket( message, emitObj )
			} catch( err ) {
				if ( err instanceof Error ) {
					this.#log.info( `OSC Decode Error :: ${err.message}` )
				} else {
					this.#log.info( 'Unexpected OSC Decode Error' )
				}
			}
		}
	}

	close() {
		if ( this.#heartbeatInterval !== null ) {
			this.#log.debug( 'Stopping Heartbeat Interval' )
			clearInterval( this.#heartbeatInterval )
			this.#heartbeatInterval = null
		}
		if ( this.connectionPrime.isListener() || this.connectionPrime.isBoth() ) {
			this.#log.debug( 'Closing connection' )
			this.connectionPrime.close()
		}
	}

	constructor( v : ConnectionDef, l : MainLogger ) {
		if ( ! ( l instanceof MainLogger ) ) {
			throw new ConnectionError( 'logger required' )
		}
		if ( typeof v.name !== 'string' || v.name === '' ) {
			throw new ConnectionError( 'name required' )
		}
		
		super()

		this.name    = v.name
		this.#log    = l.subLog( `Connection::${v.name}` )
		this.enabled = v.enabled

		this.oscHeartBeatEnabled = v.oscHeartBeatEnabled

		if ( v.connectionPrime.type === 'sender' ) {
			this.connectionPrime = new UDPSender( v.connectionPrime, this.#log )
		} else if ( v.connectionPrime.type === 'both' ) {
			this.connectionPrime = new UDPBoth( this.enabled, v.connectionPrime, this.#log, ( b ) => { this.oscInputCallback( b ) } )
		} else if ( v.connectionPrime.type === 'listen' ) {
			this.connectionPrime = new UDPListener( this.enabled, v.connectionPrime, this.#log, ( b ) => { this.oscInputCallback( b ) } )
		} else if ( v.connectionPrime.type === 'tcp-client' ) {
			this.connectionPrime = new TCPClient( this.enabled, v.connectionPrime, this.#log, ( b ) => { this.oscInputCallback( b ) } )
		} else {
			throw new Error( 'invalid connection type' )
		}

		if ( Array.isArray( v.forwarders ) && v.forwarders.length !== 0 ) {
			try {
				for ( const item of v.forwarders ) {
					this.forwarders.push(
						new UDPSender( item, this.#log )
					)
				}
			} catch( err ) {
				if ( err instanceof ConnectionError ) {
					this.#log.warn( err.message )
				} else if ( err instanceof Error ) {
					this.#log.warn( `Unexpected forwarder error :: ${err.message}` )
				} else {
					this.#log.warn( 'Unknown forwarder error' )
				}
			}
		} else {
			this.forwarders = []
		}

		try {
			if (
				v.oscHeartBeatAddress !== null &&
				typeof v.oscHeartBeatAddress === 'string' &&
				v.oscHeartBeatAddress !== ''
			) {
				const heartBeat = new OSCMessage( v.oscHeartBeatAddress )

				if ( Array.isArray( v.oscHeartBeatArgs ) ) {
					for ( const item of v.oscHeartBeatArgs ) {
						if (
							typeof item.type === 'string' &&
							typeof item.value !== 'undefined'
						) {
							heartBeat.args.push( item )
						}
					}
				} else {
					this.#log.warn( 'HeartBeat arguments not provided as array, skipped' )
				}

				this.#heartbeatBuffer     = heartBeat.buffer
				this.oscHeartBeatAddress  = v.oscHeartBeatAddress
				this.oscHeartBeatArgs     = v.oscHeartBeatArgs
				this.oscHeartBeatInterval = v.oscHeartBeatInterval ?? 1000

				if ( this.oscHeartBeatEnabled && this.enabled ) {
					this.#heartbeatInterval = setInterval( () => {
						if ( this.#heartbeatBuffer !== null ) {
							this.connectionPrime.send( this.#heartbeatBuffer )
						}
					}, this.oscHeartBeatInterval )
				}
			}
		} catch( err ) {
			if ( err instanceof Error ) {
				this.#log.warn( `HeartBeat could not be built :: ${err.message} ` )
			} else {
				this.#log.warn( 'HeartBeat Build Failed' )
			}
		}
	}
	
}

/** Error encountered when testing data */
export class ConnectionError extends TypeError {
	constructor( message : string, opts ? : ErrorOptions ) { super( message, opts ) }
}