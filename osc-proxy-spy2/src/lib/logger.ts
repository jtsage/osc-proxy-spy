/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) JTSage <https://github.com/jtsage/osc-proxy-spy> */

type LogLevel = 'INFO' | 'DEBUG' | 'WARN' | 'ERROR'

export type Logger = {
	debug : ( v : unknown ) => void,
	error : ( v : unknown ) => void,
	info  : ( v : unknown ) => void,
	warn  : ( v : unknown ) => void,
}

export class MainLogger {
	#last  : Date
	#stack : [number, LogLevel, string | null, string][] = []

	constructor() { this.#last = new Date( 1 ) }

	#add( v : unknown, l : LogLevel, n : string | null ) {
		const val = typeof v === 'string' ? v : ( v?.toString() || null )
		if ( val === null ) {
			return
		}
		this.#stack.push( [
			( new Date() ).getTime(),
			l,
			n,
			val
		] )
	}

	reset() { this.#last = new Date( 1 ) }

	get last() {
		const since = this.#last.getTime()
		this.#last = new Date()

		return this.#stack.filter( ( item ) => item[0] >= since )
	}

	get all() { return this.#stack }

	debug( v : unknown ) { this.#add( v, 'DEBUG', null ) }
	error( v : unknown ) { this.#add( v, 'ERROR', null ) }
	info( v : unknown )  { this.#add( v, 'INFO', null ) }
	warn( v : unknown )  { this.#add( v, 'WARN', null ) }

	subLog( subName : string ) : Logger {
		const debug = ( v : unknown ) =>  { this.#add( v, 'DEBUG', subName ) }
		const error = ( v : unknown ) =>  { this.#add( v, 'ERROR', subName ) }
		const info  = ( v : unknown ) =>  { this.#add( v, 'INFO', subName ) }
		const warn  = ( v : unknown ) =>  { this.#add( v, 'WARN', subName ) }
		return { debug, error, info, warn }
	}

}