/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) JTSage <https://github.com/jtsage/osc-proxy-spy> */

import { app }          from 'electron'
import { MainLogger }   from './logger'
import { OSCArgObject } from 'simple-osc-lib'
import * as Connect     from './connection'
import EventEmitter     from 'node:events'
import fs               from 'node:fs'
import path             from 'node:path'
import { networkInterfaces } from 'node:os'

export type SettingsDef = {
	connections       : Connect.ConnectionDef[]
	excludeConnection : string[]
	excludeType       : OSCArgObject['type'][]
	modeAll           : boolean
	modeTime          : boolean
}

const SettingsDefault : SettingsDef = {
	connections       : [],
	excludeConnection : [],
	excludeType       : [],
	modeAll           : true,
	modeTime          : true,
}


export class Settings extends EventEmitter {
	#connections       ! : Connect.Connection[]
	#excludeConnection ! : string[]
	#excludeType       ! : OSCArgObject['type'][]
	#intervalFreq        : ReturnType<typeof setInterval> | null = null
	#log                 : MainLogger
	#modeAll           ! : boolean
	#modeTime          ! : boolean

	get displayOptions() {
		return {
			excludeConnection : this.#excludeConnection,
			excludeType       : this.#excludeType,
			modeAll           : this.#modeAll,
			modeTime          : this.#modeTime,
		}
	}

	set excludeConnection( v : string[] )         { this.#excludeConnection = v; this.saveToDisk() }
	set excludeType( v : OSCArgObject['type'][] ) { this.#excludeType = v; this.saveToDisk() }
	set modeAll( v : boolean )                    { this.#modeAll = v; this.saveToDisk() }
	set modeTime( v : boolean )                   { this.#modeTime = v; this.saveToDisk() }

	constructor( v : Partial<SettingsDef>, l : MainLogger ) {
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

	getFreq() {
		const results : Connect.UDPListenFreqEvent[] = []
		for ( const con of this.#connections ) {
			if ( con.connectionPrime.isListener() ) {
				results.push( {
					average : con.connectionPrime.frequency,
					name    : con.name,
					since   : con.connectionPrime.sinceLast,
				} )
			}
		}
		this.emit( 'frequency', results )
	}

	addConnect( v : Connect.ConnectionDef ) {
		const connection = new Connect.Connection( v, this.#log )
		this.#connections.push( connection )
		connection.on( 'message', ( u : Connect.UDPListenEvent ) => { this.emit( 'message', u ) } )
		this.saveToDisk()
	}

	replaceConnect( i : number, v : Connect.ConnectionDef ) {
		this.#connections[i].close()
		const connection = new Connect.Connection( v, this.#log )
		this.#connections[i] = connection
		connection.on( 'message', ( u : Connect.UDPListenEvent ) => { this.emit( 'message', u ) } )
		this.saveToDisk()
	}

	removeConnect( i : number ) {
		this.#connections[i].close()
		this.#connections.splice( i, 1 )
		this.saveToDisk()
	}

	load( v : Partial<SettingsDef> ) {
		const mergedDefault = { ...SettingsDefault, ...v }

		for ( const con of mergedDefault.connections ) {
			const connection = new Connect.Connection( con, this.#log )
			this.#connections.push( connection )
			connection.on( 'message', ( u : Connect.UDPListenEvent ) => { this.emit( 'message', u ) } )
		}

		this.#excludeConnection = mergedDefault.excludeConnection
		this.#excludeType       = mergedDefault.excludeType
		this.#modeAll           = mergedDefault.modeAll
		this.#modeTime          = mergedDefault.modeTime
	}

	save() : SettingsDef {
		return {
			connections       : this.#connections.map( ( item ) => item.toJSON() ),
			excludeConnection : this.#excludeConnection,
			excludeType       : this.#excludeType,
			modeAll           : this.#modeAll,
			modeTime          : this.#modeTime,
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