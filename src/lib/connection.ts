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
import * as frame             from './tcp-frame'
import { OSCMessage, OSCArgObject, OSCPacket, OSCBundle, OSCBundleMessage } from 'simple-osc-lib'
import { OSCMessageObject } from 'simple-osc-lib/type'


type IPv4Address = string & { readonly __brand : unique symbol }
type IPv4Port    = number & { readonly __brand : unique symbol }
type OSCListenerCallback = ( b : Buffer<ArrayBufferLike> ) => void

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
	tcpStatus : boolean | null | number,
}

export type OSCListenFreqEventPart = {
	average   : number,
	ever      : boolean,
	since     : number,
	tcpStatus : boolean | null | number,
}

// MARK: Connection Definitions
export type UDPSenderDef = {
	sendAddress : string,
	sendPort    : number,
	type        : 'sender',
}

export type UDPListenerDef = {
	listenAddress : string,
	listenPort    : number,
	type          : 'listen'
}

export type UDPBothDef = {
	listenAddress : string,
	listenPort    : number,
	sendAddress   : string,
	sendPort      : number,
	type          : 'both'
}

export type TCPClientDef = {
	sendAddress : string,
	sendPort    : number,
	spec        : '1.0' | '1.1',
	type        : 'tcp-client'
}

export type TCPServerDef = {
	listenAddress : string,
	listenPort    : number,
	spec          : '1.0' | '1.1',
	type          : 'tcp-server'
}

// MARK: ConnectType
class ConnectionType {
	log         : Logger
	packetTrack : number[] = []
	enabled     : boolean = true
	callback    : OSCListenerCallback = () => {}

	constructor( enabled : boolean, logger : Logger, callback ? : OSCListenerCallback ) {
		if ( typeof logger !== 'object' ) {
			throw new ConnectionError( 'logger needed' )
		}
		if ( typeof callback === 'function' ) {
			this.callback = callback
		}
		this.log     = logger
		this.enabled = enabled
	}

	ok() : boolean { return true }

	packetTrack_clear() { this.packetTrack.length = 0 }
	packetTrack_add()   {
		while ( this.packetTrack.length > 20 ) {
			this.packetTrack.shift()
		}
		this.packetTrack.push( ( new Date() ).getTime() )
	}

	get packetTrack_ever() { return this.packetTrack.length !== 0 }
	get packetTrack_last() {
		return ( this.packetTrack.length === 0 ) ?
			Infinity :
			( new Date() ).getTime() - this.packetTrack[this.packetTrack.length - 1]
	}

	get packetTrack_frequency() {
		if ( this.packetTrack.length < 2 ) {
			return 0
		}
		const lenMinOne = this.packetTrack.length - 1
		return this.packetTrack.length / ( ( this.packetTrack[lenMinOne] - this.packetTrack[0] ) / 1000 )
	}

	get packetTrack_record() : OSCListenFreqEventPart {
		return {
			average   : this.packetTrack_frequency,
			ever      : this.packetTrack_ever,
			since     : this.packetTrack_last,
			tcpStatus : null,
		}
	}

	send( _buffer : Buffer<ArrayBufferLike> ) { return }

	isSender()    : this is UDPSender   { return false }
	isListener()  : this is UDPListener { return false }
	isBoth()      : this is UDPBoth     { return false }
	isTCPClient() : this is TCPClient   { return false }
	isTCPServer() : this is TCPServer   { return false }

	toJSON() : unknown { return {} }

	static isIPv4( ip : string ) : ip is IPv4Address {
		if ( net.isIPv4( ip ) ) {
			return true
		}
		throw new ConnectionError( 'invalid ip address' )
	}

	static isIPv4Port( port : number ) : port is IPv4Port {
		if ( Number.isInteger( port ) && port > 1023 && port < 65536 ) {
			return true
		}
		throw new ConnectionError( 'invalid port' )
	}
}

// MARK: UDPSender
export class UDPSender extends ConnectionType {
	sendAddress ! : IPv4Address
	sendPort    ! : IPv4Port

	constructor( config : UDPSenderDef, logger : Logger ) {
		super( true, logger )

		try {
			if ( ConnectionType.isIPv4( config.sendAddress ) ) {
				this.sendAddress = config.sendAddress
			}
			if ( ConnectionType.isIPv4Port( config.sendPort ) ) {
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

	isSender()    : this is UDPSender   { return true  }

	toJSON() : UDPSenderDef {
		return {
			sendAddress : this.sendAddress,
			sendPort    : this.sendPort,
			type        : 'sender',
		}
	}
}

// MARK: UDPListener
export class UDPListener extends ConnectionType {
	#socket         : dgram.Socket | null = null
	listenAddress ! : IPv4Address
	listenPort    ! : IPv4Port

	constructor( enabled : boolean, config : UDPListenerDef, logger : Logger, callback : OSCListenerCallback ) {
		super( enabled, logger, callback )

		try {
			if ( ConnectionType.isIPv4( config.listenAddress ) ) {
				this.listenAddress = config.listenAddress
			}
			if ( ConnectionType.isIPv4Port( config.listenPort ) ) {
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
		this.packetTrack_clear()
		if ( !this.enabled ) {
			return
		}
		this.#socket = dgram.createSocket( { type : 'udp4', reuseAddr : true } )

		this.#socket.on( 'message', ( buffer ) => {
			this.packetTrack_add()
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

	isListener() : this is UDPListener { return true  }
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
export class UDPBoth extends ConnectionType {
	#sharedPort     : boolean = false
	#socket         : dgram.Socket | null = null
	listenAddress ! : IPv4Address
	listenPort    ! : IPv4Port
	sendAddress   ! : IPv4Address
	sendPort      ! : IPv4Port

	constructor( enabled : boolean, config : UDPBothDef, logger : Logger, callback : OSCListenerCallback ) {
		super( enabled, logger, callback )

		try {
			if ( ConnectionType.isIPv4( config.listenAddress ) ) {
				this.listenAddress = config.listenAddress
			}
			if ( ConnectionType.isIPv4Port( config.listenPort ) ) {
				this.listenPort = config.listenPort
			}
			if ( ConnectionType.isIPv4( config.sendAddress ) ) {
				this.sendAddress = config.sendAddress
			}
			if ( ConnectionType.isIPv4Port( config.sendPort ) ) {
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
		this.packetTrack_clear()
		if ( !this.enabled ) {
			return
		}
		this.#socket = dgram.createSocket( { type : 'udp4', reuseAddr : true } )

		this.#socket.on( 'message', ( buffer ) => {
			this.packetTrack_add()
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

	isBoth() : this is UDPBoth     { return true}
	ok()     : boolean { return this.#socket !== null }

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

//MARK: TCPClient
export class TCPClient extends ConnectionType {
	#client         : net.Socket | null = null
	#ready          : boolean = false
	#spec         ! : '1.0' | '1.1'
	sendAddress   ! : IPv4Address
	sendPort      ! : IPv4Port
	sendOnly        : boolean = false
	retryAttempts   : number = 0
	retryTimeout    : ReturnType<typeof setTimeout> | null = null
	#decoder        : frame.TCPTransportDecoder
	#encoder        : frame.encoder

	constructor( enabled : boolean, config : TCPClientDef, logger : Logger, callback : OSCListenerCallback, sendOnly = false ) {
		super( enabled, logger, callback )
		this.sendOnly = sendOnly
		this.#spec    = config.spec

		this.#decoder = new frame.TCPTransportDecoder(
			( msg ) => this.callback( msg ),
			this.#spec
		)
		this.#encoder = this.#spec === '1.1' ? frame.encodeSLIP : frame.encodePacketLength

		try {
			if ( ConnectionType.isIPv4( config.sendAddress ) ) {
				this.sendAddress = config.sendAddress
			}
			if ( ConnectionType.isIPv4Port( config.sendPort ) ) {
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
		this.packetTrack_clear()
		this.retryAttempts++

		if ( !this.enabled ) {
			return
		}
		try {
			this.#client = net.createConnection( this.sendPort, this.sendAddress )

			if ( ! this.sendOnly ) {
				this.#client.on( 'data', ( buffer ) => {
					this.packetTrack_add()

					const thisBuffer = typeof buffer === 'string' ? Buffer.from( buffer ) : buffer
					this.#decoder.consume( thisBuffer )
				} )
			}

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
				this.log.info( 'Retry connect in 15secs...' )
				this.retryTimeout = setTimeout( () => { this.open() }, 15000 )
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

	isTCPClient() : this is TCPClient   { return true }
	ok()          : boolean { return this.#ready }

	send( buffer : Buffer<ArrayBufferLike> ) {
		if ( this.ok() && this.#client?.writable ) {
			this.#client.write( this.#encoder( buffer ) )
		} else {
			this.log.warn( `send to ${this.sendAddress}:${this.sendPort} failed :: socket not open` )
		}
	}

	get packetTrack_record() : OSCListenFreqEventPart {
		return  {
			...super.packetTrack_record,
			tcpStatus : this.ok(),
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

//MARK: TCPServer
export class TCPServer extends ConnectionType {
	#server         : net.Server | null = null
	#ready          : boolean = false
	#spec         ! : '1.0' | '1.1'
	listenAddress ! : IPv4Address
	listenPort    ! : IPv4Port
	sendOnly        : boolean = false
	socketList      : Set<net.Socket> = new Set()
	#decoder        : frame.TCPTransportDecoder
	#encoder        : frame.encoder

	constructor( enabled : boolean, config : TCPServerDef, logger : Logger, callback : OSCListenerCallback, sendOnly = false ) {
		super( enabled, logger, callback )
		this.sendOnly = sendOnly
		this.#spec    = config.spec

		this.#decoder = new frame.TCPTransportDecoder(
			( msg ) => this.callback( msg ),
			this.#spec
		)
		this.#encoder = this.#spec === '1.1' ? frame.encodeSLIP : frame.encodePacketLength

		try {
			if ( ConnectionType.isIPv4( config.listenAddress ) ) {
				this.listenAddress = config.listenAddress
			}
			if ( ConnectionType.isIPv4Port( config.listenPort ) ) {
				this.listenPort = config.listenPort
			}
		} catch( err ) {
			if ( err instanceof ConnectionError ) {
				this.log.error( err.message )
				throw new ConnectionError( `unable to create TCPServer connection :: ${err.message}` )
			}
			throw err
		}

		this.open()
	}

	close() {
		if ( this.#server !== null ) {
			for ( const socket of this.socketList ) { socket.destroy() }
			this.#server.close()
			this.#ready = false
		}
	}

	open() {
		this.packetTrack_clear()

		if ( !this.enabled ) {
			return
		}
		try {
			this.#server = net.createServer( ( socket ) => {
				this.socketList.add( socket )
				socket.on( 'end', () => {
					this.log.info( `${socket.remoteAddress}:${socket.remotePort} disconnected` )
					this.socketList.delete( socket )
				} )
				socket.on( 'error', ( err 	) => {
					if ( err instanceof Error ) {
						this.log.info( `${socket.remoteAddress}:${socket.remotePort} error : ${err.message}` )
					} else {
						this.log.info( `${socket.remoteAddress}:${socket.remotePort} unknown error` )
					}
				} )
				if ( ! this.sendOnly ) {
					socket.on( 'data', ( buffer ) => {
						this.packetTrack_add()

						const thisBuffer = typeof buffer === 'string' ? Buffer.from( buffer ) : buffer

						this.#decoder.consume( thisBuffer )
					} )
				}
			} )

			this.#server.on( 'error', ( err ) => {
				this.log.error( `server error, closing :: ${err.message}` )
				this.#ready = false
				this.close()
			} )

			this.#server.on( 'close', () => {
				this.log.info( 'server closed' )
				this.#ready = false
			} )

			this.#server.on( 'listening', () => {
				this.log.info( 'server opened' )
				this.#ready = true
			} )

			this.#server.on( 'connection', ( socket ) => { this.log.info( `client connected :: ${socket.remoteAddress}` ) } )

			this.#server.listen( this.listenPort, this.listenAddress )
		} catch( err ) {
			if ( err instanceof Error ) {
				this.log.error( `connection bind error :: ${err.message}` )
			} else {
				this.log.error( 'connection bind error :: unknown' )
			}
			this.#server = null
		}

	}

	isTCPServer() : this is TCPServer   { return true }
	ok()          : boolean { return this.#ready }

	send( buffer : Buffer<ArrayBufferLike> ) {
		if ( this.#ready === true ) {
			for ( const socket of this.socketList ) { socket.write( this.#encoder( buffer ) ) }
		} else {
			this.log.warn( `send to ${this.listenAddress}:${this.listenPort} server failed :: server not open` )
		}
	}

	get packetTrack_record() : OSCListenFreqEventPart {
		return  {
			...super.packetTrack_record,
			tcpStatus : this.socketList.size,
		}
	}

	toJSON() : TCPServerDef {
		return {
			listenAddress : this.listenAddress,
			listenPort    : this.listenPort,
			spec          : this.#spec,
			type          : 'tcp-server',
		}
	}
}

// MARK: ConnectionDef
export type ConnectionDefTypes = UDPListenerDef | UDPSenderDef | UDPBothDef | TCPClientDef | TCPServerDef
export type ConnectionDef = {
	connectionPrime      : ConnectionDefTypes
	enabled              : boolean
	forwarders           : Array<UDPSenderDef | TCPClientDef | TCPServerDef>
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
	connectionPrime      : UDPListener | UDPSender | UDPBoth | TCPClient | TCPServer
	enabled              : boolean = true
	forwarders           : Array<UDPSender | TCPClient | TCPServer> = []
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
		if ( this.connectionPrime.isListener() || this.connectionPrime.isBoth() || this.connectionPrime.isTCPClient() || this.connectionPrime.isTCPServer() ) {
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
		if ( this.connectionPrime.isListener() || this.connectionPrime.isBoth() || this.connectionPrime.isTCPClient() || this.connectionPrime.isTCPServer() ) {
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
		} else if ( v.connectionPrime.type === 'tcp-server' ) {
			this.connectionPrime = new TCPServer( this.enabled, v.connectionPrime, this.#log, ( b ) => { this.oscInputCallback( b ) } )
		} else {
			throw new Error( 'invalid connection type' )
		}

		if ( Array.isArray( v.forwarders ) && v.forwarders.length !== 0 ) {
			try {
				for ( const item of v.forwarders ) {
					if ( item.type === 'sender' ) {
						this.forwarders.push( new UDPSender( item, this.#log ) )
					} else if ( item.type === 'tcp-client' ) {
						this.forwarders.push( new TCPClient( true, item, this.#log, () => {}, true ) )
					} else if ( item.type === 'tcp-server' ) {
						this.forwarders.push( new TCPServer( true, item, this.#log, () => {}, true ) )
					}
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