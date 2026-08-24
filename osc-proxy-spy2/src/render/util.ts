/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) JTSage <https://github.com/jtsage/osc-proxy-spy> */

import { OSCArgObject, OSCBundleObject, OSCMessageObject } from 'simple-osc-lib/type'
import { UDPListenEvent, UDPListenFreqEvent } from '../../src/lib/connection'

const TWO_POW_32 = 4294967296
const UNIX_EPOCH = 2208988800

// MARK: safe element ops
export const listenToId = ( id : string, type : string, func : EventListenerOrEventListenerObject ) => {
	const element = getId( id )
	if ( element !== null ) {
		element.addEventListener( type, func )
	}
}

export const setInnerHTML = ( id : string, value : string ) => {
	const element = getId( id )
	if ( element !== null ) {
		element.innerHTML = value
	}
}

export const getId = ( id : string ) => { return document.getElementById( id ) }

export const getFormId = ( id : string ) => {
	const element = getId( id )
	if ( element instanceof HTMLInputElement && element !== null ) {
		return element
	}
	return null
}

export const getSelectValue = ( id : string ) : string | null => {
	const element = getId( id )
	if ( element instanceof HTMLSelectElement && element !== null ) {
		return element.value
	}
	return null
}

export const getFormValue = ( id : string ) : string | null => {
	const element = getId( id )
	if ( element instanceof HTMLInputElement && element !== null ) {
		return element.value
	}
	return null
}

export const getFormCheck = ( id : string ) : boolean => {
	const element = getId( id )
	if ( element instanceof HTMLInputElement && element !== null ) {
		return element.checked
	}
	return false
}

export const safeClassAdd = ( element : Element | null | undefined, className : string ) => {
	if ( typeof element !== 'undefined' && element !== null ) {
		element.classList.add( className )
	}
}

export const safeClassRem = ( element : Element | null | undefined, className : string ) => {
	if ( typeof element !== 'undefined' && element !== null ) {
		element.classList.remove( className )
	}
}

export const safeAppend = ( id : string, child : string | Element ) => {
	const element = getId( id )
	if ( element !== null ) {
		if ( child instanceof Element ) {
			element.appendChild( child )
		} else {
			element.appendChild( document.createRange().createContextualFragment( child ) )
		}
	}
}

export const classAdd = ( id : string, classes : string | string[] ) => {
	const element = getId( id )
	if ( element !== null ) {
		if ( typeof classes === 'string' ) {
			element.classList.add( classes )
		} else {
			element.classList.add( ...classes )
		}
	}
}

export const classRemove = ( id : string, classes : string | string[] ) => {
	const element = getId( id )
	if ( element !== null ) {
		if ( typeof classes === 'string' ) {
			element.classList.remove( classes )
		} else {
			element.classList.remove( ...classes )
		}
	}
}

export const setFormValue = ( id : string, value : string ) => {
	const element = getId( id )
	if ( element instanceof HTMLInputElement && element !== null ) {
		element.value = value
	}
}

export const setSelectValue = ( id : string, value : string ) => {
	const element = getId( id )
	if ( element instanceof HTMLSelectElement && element !== null ) {
		element.value = value
	}
}

export const setFormCheck = ( id : string, value : boolean ) => {
	const element = getId( id )
	if ( element instanceof HTMLInputElement && element !== null ) {
		element.checked = value
	}
}

export const setFormEnabled = ( id : string, enabled : boolean ) => {
	const element = getId( id )
	if ( element instanceof HTMLInputElement && element !== null ) {
		element.disabled = !enabled
	}
}

interface OSCEventType {
	bundleTime : number | null | false
	address    : string
	message    : OSCMessageObject | OSCBundleObject
	name       : string
	port       : number
	timestamp  : number
}

interface OSCEventMessageType extends OSCEventType {
	message : OSCMessageObject
}

interface OSCEventBundleType extends OSCEventType {
	message : OSCBundleObject
}


class OSCEvent implements OSCEventType {
	bundleTime : number | null | false
	address    : string
	message    : OSCMessageObject | OSCBundleObject
	name       : string
	port       : number
	timestamp  : number

	constructor( v : UDPListenEvent ) {
		this.address   = v.address
		this.message   = v.message
		this.name      = v.name
		this.port      = v.port
		this.timestamp = v.timestamp

		if ( this.isBundle() ) {
			if ( this.message.timeTag[0] === 0 && this.message.timeTag[1] === 1 ) {
				this.bundleTime = null
			} else {
				const packetDate = new Date( v.timestamp )
				const seconds    = this.message.timeTag[0] - UNIX_EPOCH
				const fractional = parseFloat( this.message.timeTag[1].toString() ) / TWO_POW_32
				
				this.bundleTime = packetDate.getTime() - ( ( seconds * 1000 ) + ( fractional * 1000 ) )
			}
		} else {
			this.bundleTime = false
		}
	}

	isBundle() : this is OSCEventBundleType { return this.message.type === 'bundle' }
	isSingle() : this is OSCEventMessageType { return this.message.type === 'message' }
}


export const buildUDPListenEvent = ( v : UDPListenEvent ) => {
	const packet = new OSCEvent( v )
	safeAppend( 'osc-data-container', buildMessagePacket( packet ) )
}

export const replaceUDPListenEvent = ( v : UDPListenEvent ) => {
	const packet = new OSCEvent( v )
	return replaceMessagePacket( packet )
}

export const replaceMessagePacket = ( v : OSCEvent ) => {
	if ( v.isSingle() ) {
		if ( replaceMessage( v ) === false ) {
			safeAppend( 'osc-data-container', buildEachMessage( v ) )
		}
	} else if ( v.isBundle() ) {
		replaceBundleMessage( v )
	}
}

export const buildMessagePacket = ( v : OSCEvent ) : string => {
	if ( v.isSingle() ) {
		return buildEachMessage( v )
	} else if ( v.isBundle() ) {
		return buildBundleMessage( v )
	}
	return ''
}

const replaceBundleMessage = ( v : OSCEventBundleType ) => {
	for ( const item of v.message.messages ) {
		if ( item.type === 'bundle' ) {
			continue
		}

		const itemArg = {
			address    : item.address,
			bundleTime : v.bundleTime,
			message    : item,
			name       : v.name,
			port       : v.port,
			timestamp  : v.timestamp,
		}

		if ( replaceMessage( itemArg ) === false ) {
			safeAppend( 'osc-data-container', buildEachMessage( itemArg ) )
		}
	}
}

const buildBundleMessage = ( v : OSCEventBundleType ) : string => {
	return v.message.messages.map( ( item ) => {
		if ( item.type === 'bundle' ) {
			return ''
		}

		return buildEachMessage( {
			address    : item.address,
			bundleTime : v.bundleTime,
			message    : item,
			name       : v.name,
			port       : v.port,
			timestamp  : v.timestamp,
		} )
	} ).join( '\n' )
}

// eslint-disable-next-line @stylistic/newline-per-chained-call
const getHumanDate = ( v : Date ) => `${v.getHours().toString().padStart( 2, '0' )}:${v.getMinutes().toString().padStart( 2, '0' )}:${v.getSeconds().toString().padStart( 2, '0' )}.${v.getMilliseconds().toString().padStart( 3, '0' )}`


const buildEachMessage = ( v : OSCEventMessageType ) : string => {
	const humanDate   = getHumanDate( new Date( v.timestamp ) )

	return [
		OSCDisplayParts.start(
			v.name,
			v.message.address,
			v.address,
			v.port
		),
		OSCDisplayParts.timeStamp( humanDate ),
		v.bundleTime === false ? '' : OSCDisplayParts.bundleTime( v.bundleTime ),
		OSCDisplayParts.connection( v.name ),
		OSCDisplayParts.address( v.message.address ),
		'<div class="message-args">',
		...v.message.elements.map( ( item ) => OSCDisplayParts.arg( item ) ),
		'</div></div>'
	].join( '' )
}

const replaceMessage = ( v : OSCEventMessageType ) : boolean => {
	const current = document.querySelector( `div[data-address="${v.message.address}"][data-connection="${v.name}"]` )

	if ( current === null ) {
		return false
	}

	const humanDate   = getHumanDate( new Date( v.timestamp ) )
	const dateEle = current.querySelector( '.osc-timestamp' )
	if ( dateEle !== null ) {
		dateEle.innerHTML = humanDate
	}
	const argEle = current.querySelector( '.message-args' )
	if ( argEle !== null ) {
		argEle.innerHTML = v.message.elements.map( ( item ) => OSCDisplayParts.arg( item ) ).join( '' )
	}
	const nameEle = current.querySelector( '.osc-name' )
	if ( nameEle !== null ) {
		nameEle.classList.add( 'osc-name-refresh' )
		nameEle.addEventListener( 'animationend', () => { nameEle.classList.remove( 'osc-name-refresh' ) }, { once : true } )
	}
	
	return true
}

export const OSCDisplayParts = {
	address    : ( v : string ) => `<div class="osc-address">${v}</div>`,
	connection : ( v : string ) => `<div class="osc-name">${v}</div>`,
	start      : ( c : string, a : string, i : string, p : number ) => `<div class="data-osc" data-connection="${c}" data-address="${a}" title="${i}:${p}">`,
	timeStamp  : ( v : string ) => `<div class="osc-timestamp">${v}</div>`,

	arg        : ( v : OSCArgObject ) => {
		if ( v.value === null || v.value === 'null' ) {
			return ''
		} else if ( v.type === 'string' || v.type === 'symbol' ) {
			return `<div title="${v.type}" class="osc-arg-${v.type}">${v.value === '' || v.value === ' ' ? '&nbsp;' : v.value }</div>`
		}
		return `<div title="${v.type}" class="osc-arg-${v.type}">${v.value}</div>`
	},
	bundleTime : ( v : number | null ) => {
		if ( v === null ) {
			return '<div class="osc-bundle-stamp-good" title="Instant Execution">b:I</div>'
		}
		return `<div class="osc-bundle-stamp-${ v < 0 ? 'bad' : 'good' }">b:${v < 0 ? '' : '+'}${ v }ms</div>`
	},
	
}

export const freqEntry = ( v : UDPListenFreqEvent ) => {
	const timeString     = `${( Math.round( v.average * 10 ) / 10 ).toFixed( 1 )} m/s`
	const sinceString    = ( v.since > 10000 ) ? '>10s' : `${( v.since / 1000 ).toFixed( 2 )}s`
	const thisColorClass = ! v.ever ? 'osc-tick-name-bad' : v.since > 10000 ? 'osc-tick-name-maybe' : 'osc-tick-name-good'
	const foundItem = document.querySelector( `[data-tick-time="${v.name}"]` )

	if ( foundItem !== null ) {
		const nameItem = document.querySelector( `[data-tick-name="${v.name}"]` )
		if ( nameItem !== null && !nameItem.classList.contains( thisColorClass ) ) {
			nameItem.classList.remove( 'osc-tick-name-bad', 'osc-tick-name-good', 'osc-tick-name-maybe' )
			nameItem.classList.add( thisColorClass )
		}
		foundItem.textContent = timeString
		const sinceItem = document.querySelector( `[data-tick-since="${v.name}"]` )
		if ( sinceItem !== null ) {
			sinceItem.textContent = sinceString
		}
			
		return
	}
		
	const thisDiv = document.createElement( 'div' )
	thisDiv.innerHTML = [
		`<div data-tick-name="${v.name}" class="${thisColorClass}">${v.name}</div>`,
		`<div data-tick-time="${v.name}" class="osc-tick-time">${timeString}</div>`,
		`<div data-tick-since="${v.name}" class="osc-tick-time">${sinceString}</div>`,
	].join( '' )

	safeAppend( 'osc-connection-container', thisDiv )
	
	// const infoHeight = Util.byId('osc-connection-info').offsetHeight
	// const bodyHeight = document.body.offsetHeight
	// Util.byId('osc-data-container').style.maxHeight = `calc(${Math.floor(bodyHeight - infoHeight)}px - 1rem)`

}