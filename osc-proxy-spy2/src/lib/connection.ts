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
import { OSCMessage, OSCArgObject, OSCPacket } from 'simple-osc-lib'
import { OSCMessageObject, OSCBundleObject } from 'simple-osc-lib/type'


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

export type UDPListenEvent = {
	message   : OSCMessageObject | OSCBundleObject,
	timestamp : number,
	name      : string,
	address   : string,
	port      : number
}

export type UDPListenFreqEvent = {
	average : number,
	name    : string
	since   : number,
}

export type UDPSenderDef = {
	address : string,
	port    : number,
	type    : 'sender',
}

export class UDPSender {
	address ! : IPv4Address
	log       : Logger
	port    ! : IPv4Port

	constructor( config : UDPSenderDef, logger : Logger ) {
		if ( typeof logger !== 'object' ) {
			throw new ConnectionError( 'logger needed' )
		}
		this.log = logger

		try {
			if ( isIPv4( config.address ) ) {
				this.address = config.address
			}
			if ( isIPv4Port( config.port ) ) {
				this.port = config.port
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
			this.log.warn( `send to ${this.address}:${this.port} failed :: empty or non-buffer` )
			return
		}

		client.send( buffer, 0, buffer.length, this.port, this.address, ( err ) => {
			if ( err ) {
				this.log.warn( `send to ${this.address}:${this.port} failed :: ${err.message}` )
			}
			client.close()
		} )
	}

	isSender()   : this is UDPSender   { return true }
	isListener() : this is UDPListener { return false}

	toJSON() : UDPSenderDef {
		return {
			address : this.address,
			port    : this.port,
			type    : 'sender',
		}
	}
}

type UDPListenerCallback = ( b : Buffer<ArrayBufferLike> ) => void

export type UDPListenerDef = {
	listenAddress : string,
	listenPort    : number,
	sendAddress   : string,
	sendPort      : number,
	type          : 'listen'
}

export class UDPListener {
	#lastSix        : number[] = []
	#sharedPort     : boolean = false
	#socket         : dgram.Socket | null = null
	callback        : UDPListenerCallback
	enabled         : boolean = true
	listenAddress ! : IPv4Address
	listenPort    ! : IPv4Port
	sendAddress   ! : IPv4Address
	sendPort      ! : IPv4Port
	log             : Logger

	constructor( enabled : boolean, config : UDPListenerDef, logger : Logger, callback : UDPListenerCallback ) {
		if ( typeof logger !== 'object' ) {
			throw new ConnectionError( 'logger needed' )
		}
		if ( ! ( typeof callback === 'function' ) ) {
			throw new ConnectionError( 'callback needed' )
		}
		this.callback = callback
		this.log      = logger

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
			this.#lastSix.shift()
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

	get sinceLast() {
		if ( this.#lastSix.length === 0 ) {
			return Infinity
		}
		return ( new Date() ).getTime() - this.#lastSix[0]
	}

	get frequency() {
		if ( this.#lastSix.length < 2 ) {
			return 0
		}
		const lenMinOne = this.#lastSix.length - 1
		return ( this.#lastSix[lenMinOne] - this.#lastSix[0] ) / lenMinOne
	}

	isSender()   : this is UDPSender   { return false }
	isListener() : this is UDPListener { return true}
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
			this.#socket.send( buffer, ( err ) => {
				if ( err ) {
					this.log.warn( `send to ${this.sendAddress}:${this.sendPort} failed :: ${err.message}` )
				}
			} )
		} else {
			this.log.warn( `send to ${this.sendAddress}:${this.sendPort} failed :: socket not open` )
		}
	}

	toJSON() : UDPListenerDef {
		return {
			listenAddress : this.listenAddress,
			listenPort    : this.listenPort,
			sendAddress   : this.sendAddress,
			sendPort      : this.sendPort,
			type          : 'listen',
		}
	}
}

export type ConnectionDef = {
	connectionPrime      : UDPListenerDef | UDPSenderDef
	enabled              : boolean
	forwarders           : UDPSenderDef[]
	name                 : string
	oscHeartBeatAddress  : string | null
	oscHeartBeatArgs     : OSCArgObject[]
	oscHeartBeatEnabled  : boolean
	oscHeartBeatInterval : number | null
}

export class Connection extends EventEmitter {
	#heartbeatBuffer     : Buffer<ArrayBufferLike> | null = null
	#heartbeatInterval   : ReturnType<typeof setInterval> | null = null
	#log                 : Logger
	connectionPrime      : UDPListener | UDPSender
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

	oscInputCallback( b : Buffer<ArrayBufferLike> ) {
		if ( Buffer.isBuffer( b ) && b.length !== 0 ) {
			for ( const forwarder of this.forwarders ) { forwarder.send( b ) }
		}
		if ( this.connectionPrime.isListener() ) {
			try {
				const message = OSCPacket.fromBuffer( b )

				const emitMessage : UDPListenEvent = {
					address   : this.connectionPrime.listenAddress,
					message   : message.toJSON(),
					name      : this.name,
					port      : this.connectionPrime.listenPort,
					timestamp : ( new Date() ).getTime(),
				}
				this.emit( 'message', emitMessage )
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
			clearInterval( this.#heartbeatInterval )
			this.#heartbeatInterval = null
		}
		if ( this.connectionPrime.isListener() ) {
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

		this.name = v.name
		this.#log = l.subLog( `Connection::${v.name}` )

		this.oscHeartBeatEnabled = v.oscHeartBeatEnabled

		if ( v.connectionPrime.type === 'sender' ) {
			this.connectionPrime = new UDPSender( v.connectionPrime, this.#log )
		} else {
			this.connectionPrime = new UDPListener( this.enabled, v.connectionPrime, this.#log, this.oscInputCallback )
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

				if ( this.oscHeartBeatEnabled ) {
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