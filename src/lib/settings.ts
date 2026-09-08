/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) JTSage <https://github.com/jtsage/osc-proxy-spy> */

import { app }          from 'electron'
import { MainLogger }   from './logger'
import { OSCArgObject, OSCMessage } from 'simple-osc-lib'
import * as Connect     from './connection'
import EventEmitter     from 'node:events'
import fs               from 'node:fs'
import path             from 'node:path'
import { networkInterfaces } from 'node:os'

export type SettingsDef = {
	connections       : Connect.ConnectionDef[]
	excludeConnection : string[]
	excludeType       : Array<OSCArgObject['type'] | 'other'>
	matchTerm         : string | null
	modeAll           : boolean
	sendAddress       : string | null
	sendArgs          : Array<OSCArgObject>
	sendConnect       : number | null
}

const SettingsDefault : SettingsDef = {
	connections       : [],
	excludeConnection : [],
	excludeType       : [],
	matchTerm         : null,
	modeAll           : true,
	sendAddress       : null,
	sendArgs          : [],
	sendConnect       : null,
}


export class Settings extends EventEmitter {
	#connections         : Connect.Connection[] = []
	#excludeConnection ! : string[]
	#excludeType       ! : Array<OSCArgObject['type'] | 'other'>
	#intervalFreq        : ReturnType<typeof setInterval> | null = null
	#log                 : MainLogger
	#matchTerm           : string | null = null
	#modeAll           ! : boolean
	#sendAddress       ! : string | null
	#sendArgs          ! : Array<OSCArgObject>
	#sendConnect       ! : number | null

	get displayOptions() {
		return {
			excludeConnection : this.#excludeConnection,
			excludeType       : this.#excludeType,
			matchTerm         : this.#matchTerm,
			modeAll           : this.#modeAll,
			sendAddress       : this.#sendAddress,
			sendArgs          : this.#sendArgs,
			sendConnect       : this.#sendConnect,
		}
	}

	set excludeConnection( v : string[] )         { this.#excludeConnection = v; this.saveToDisk() }
	set excludeType( v : OSCArgObject['type'][] ) { this.#excludeType = v; this.saveToDisk() }
	set modeAll( v : boolean )                    { this.#modeAll = v; this.saveToDisk() }
	set matchTerm( v : string )                   { this.#matchTerm = v; this.saveToDisk() }
	set sendAddress( v : string | null )          { this.#sendAddress = v; this.saveToDisk() }
	set sendArgs( v : Array<OSCArgObject> )       { this.#sendArgs = v; this.saveToDisk() }
	set sendConnect( v : number | null )          { this.#sendConnect = v; this.saveToDisk() }

	constructor( l : MainLogger ) {
		super()

		this.#log = l
		this.load( this.loadFromDisk() )

		this.#intervalFreq = setInterval( () => { this.getFreq() }, 1000 )
	}

	exit() {
		if ( this.#intervalFreq !== null ) {
			clearInterval( this.#intervalFreq )
		}
		this.saveToDisk()
	}

	sendMessage() {
		if ( this.#sendConnect === null ) {
			this.#log.info( 'Unable to send OSC Message :: No or Invalid Connection Specified' )
			return false
		}
		if ( this.#sendAddress === null ) {
			this.#log.info( 'Unable to send OSC Message :: OSC Address required' )
			return false
		}

		const thisCon = this.#connections[this.#sendConnect]

		if (
			typeof thisCon !== 'undefined' && (
				thisCon.connectionPrime.isSender() ||
				thisCon.connectionPrime.isBoth()
			)
		) {
			try {
				const oscMessage = new OSCMessage( this.#sendAddress, this.#sendArgs )
				thisCon.connectionPrime.send( oscMessage.buffer )
				this.#log.info( `Sent OSC Message :: ${oscMessage.debug}` )
				const thisEmitMsg : Connect.UDPListenEvent = {
					address    : thisCon.connectionPrime.sendAddress,
					bundleTime : false,
					message    : oscMessage.toJSON(),
					name       : `${thisCon.name}-SEND`,
					port       : thisCon.connectionPrime.sendPort,
					timestamp  : ( new Date() ).getTime(),
				}
				this.emit( 'message', thisEmitMsg )
				
				return true
			} catch( err ) {
				if ( err instanceof Error ) {
					this.#log.info( `Unable to send OSC Message :: ${err}` )
				} else {
					this.#log.info( 'Unable to send OSC Message :: Unexpected Error' )
				}
				return false
			}
		}
		this.#log.info( 'Unable to send OSC Message :: No or Invalid Connection Specified' )
		return false
	}

	getFreq() {
		const results : Connect.UDPListenFreqEvent[] = []
		for ( const con of this.#connections ) {
			if ( con.connectionPrime.isListener() || con.connectionPrime.isBoth() ) {
				results.push( {
					average : con.connectionPrime.frequency,
					ever    : con.connectionPrime.sinceEver,
					name    : con.name,
					since   : con.connectionPrime.sinceLast,
				} )
			}
		}
		this.emit( 'frequency', results )
	}

	#emitWithChecks( v : Connect.UDPListenEvent ) {
		// excluded collections
		if ( this.#excludeConnection.length !== 0 && this.#excludeConnection.includes( v.name ) ) {
			return
		}
		// excluded types
		
		if ( this.#excludeType.length !== 0 ) {

			const realExclude = ! this.#excludeType.includes( 'other' ) ?
				this.#excludeType :
				[
					...this.#excludeType,
					'bigint', 'arrayOpen', 'arrayClose', 'blob',
					'true', 'false', 'null', 'bang', 'color', 'char', 'midi'
				]

			for ( const arg of v.message.elements ) {
				if ( realExclude.includes( arg.type ) ) {
					return
				}
			}
		}

		if ( this.#matchTerm !== null && this.#matchTerm !== '' ) {
			const regExpPattern = this.#matchTerm
				.replaceAll( '.', '\\.' )
				.replaceAll( /{(.+?)}/g, ( _, grp ) => `(${grp.replaceAll( ',', '|' )})` )
				.replaceAll( /\[(.+?)]/g, '([$1])' )
				.replaceAll( '?', '([^/])' )
				.replaceAll( '*', '([^/]*)' )
				.replaceAll( '\\', '\\\\' )

			const regExpCompiled = new RegExp( `${regExpPattern}` )
			const matches = regExpCompiled.exec( v.message.address )
			if ( matches === null ) {
				return
			}
		}

		this.emit( 'message', v )
	}

	addConnect( v : Connect.ConnectionDef ) : SettingsDef {
		const connection = new Connect.Connection( v, this.#log )
		this.#connections.push( connection )
		connection.on( 'message', ( u : Connect.UDPListenEvent ) => { this.#emitWithChecks( u ) } )
		this.saveToDisk()
		return this.save()
	}

	replaceOrAdd( i : number, v : Connect.ConnectionDef ) : [boolean, SettingsDef] {
		try {
			return [true, ( typeof this.#connections[i] !== 'undefined' ) ?
				this.replaceConnect( i, v ) :
				this.addConnect( v )
			]
		} catch( err ) {
			if ( err instanceof Error ) {
				this.#log.warn( `Unable to update connection record :: ${err.message}` )
			}
			return [false, this.save()]
		}
	}

	replaceConnect( i : number, v : Connect.ConnectionDef ) : SettingsDef {
		this.#connections[i].close()
		const connection = new Connect.Connection( v, this.#log )
		this.#connections[i] = connection
		connection.on( 'message', ( u : Connect.UDPListenEvent ) => { this.#emitWithChecks( u ) } )
		this.saveToDisk()
		return this.save()
	}

	removeConnect( i : number ) {
		this.#connections[i].close()
		this.#connections.splice( i, 1 )
		this.saveToDisk()
		return this.save()
	}

	load( v : Partial<SettingsDef> ) {
		const mergedDefault = { ...SettingsDefault, ...v }

		for ( const con of mergedDefault.connections ) {
			const connection = new Connect.Connection( con, this.#log )
			this.#connections.push( connection )
			connection.on( 'message', ( u : Connect.UDPListenEvent ) => { this.#emitWithChecks( u ) } )
		}

		this.#excludeConnection = mergedDefault.excludeConnection
		this.#excludeType       = mergedDefault.excludeType
		this.#matchTerm         = mergedDefault.matchTerm
		this.#modeAll           = mergedDefault.modeAll
		this.#sendAddress       = mergedDefault.sendAddress
		this.#sendArgs          = mergedDefault.sendArgs
		this.#sendConnect       = mergedDefault.sendConnect
	}

	save() : SettingsDef {
		return {
			connections       : this.#connections.map( ( item ) => item.toJSON() ),
			excludeConnection : this.#excludeConnection,
			excludeType       : this.#excludeType,
			matchTerm         : this.#matchTerm,
			modeAll           : this.#modeAll,
			sendAddress       : this.#sendAddress,
			sendArgs          : this.#sendArgs,
			sendConnect       : this.#sendConnect,
		}
	}

	saveToDisk() {
		try {
			fs.writeFileSync( this.#path, JSON.stringify( this.save(), null, 4 ) )
			this.#log.info( 'Saved Settings File' )
		} catch( err ) {
			if ( err instanceof Error ) {
				this.#log.error( `Unable to save settings :: ${err.message}` )
			} else {
				this.#log.error( 'Unable to save settings' )
			}
		}
	}

	loadFromDisk() : Partial<SettingsDef> {
		if ( ! fs.existsSync( this.#path ) ) {
			return {}
		}
		try {
			const loadedSettings = JSON.parse( fs.readFileSync( this.#path, 'utf-8' ) )
			return loadedSettings
		} catch( err ) {
			if ( err instanceof Error ) {
				this.#log.error( `Unable to load settings :: ${err.message}` )
			} else {
				this.#log.error( 'Unable to load settings' )
			}
		}
		return {}
	}

	get #path() { return path.join( app.getPath( 'userData' ), 'config.json' ) }
}

export function getNetworkInterfaces() {
	const validNetworks = new Set( ['0.0.0.0'] )

	for ( const iface of Object.values( networkInterfaces() ) ) {
		if ( typeof iface === 'undefined' ) {
			continue
		}
		for ( const address of iface ) {
			if ( address.family === 'IPv4' ) {
				validNetworks.add( address.address )
			}
		}
	}

	return [...validNetworks].sort()
}