/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) JTSage <https://github.com/jtsage/osc-proxy-spy> */

import { OSCArgObject } from 'simple-osc-lib/type'
import { OSCListenEvent, OSCListenFreqEvent, ConnectionDefTypes, UDPListenerDef, UDPBothDef, UDPSenderDef, TCPClientDef } from '../../src/lib/connection'

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

export const getSafeSelectValue = ( id : string, oldValue : string ) : string => {
	const element = getId( id )
	if ( element instanceof HTMLSelectElement && element !== null ) {
		return element.value
	}
	return oldValue
}

export const getFormValue = ( id : string ) : string | null => {
	const element = getId( id )
	if ( element instanceof HTMLInputElement && element !== null ) {
		return element.value
	}
	return null
}

export const getSafeFormValue = ( id : string, oldValue : string ) : string => {
	const element = getId( id )
	if ( element instanceof HTMLInputElement && element !== null ) {
		return element.value
	}
	return oldValue
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

export const setButtonEnabled = ( id : string, enabled : boolean ) => {
	const element = getId( id )
	if ( element instanceof HTMLButtonElement && element !== null ) {
		element.disabled = !enabled
	}
}

export const queryAInput = ( term : string ) => {
	const items : HTMLInputElement[] = []
	for ( const element of document.querySelectorAll( term ) ) {
		if ( element instanceof HTMLInputElement && element !== null ) {
			items.push( element )
		}
	}
	return items
}

// MARK: feedback and UI utility
const operationFeedback = ( id : string ) => {
	classRemove( id, ['d-none', 'hide'] )
	classAdd( id, 'show' )
	setTimeout( () => {
		classAdd( id, ['hide', 'd-none'] )
		classRemove( id, 'show' )
	}, 1000 )
}
export const goodOperation = () => { operationFeedback( 'operation-good' ) }
export const badOperation  = () => { operationFeedback( 'operation-bad' ) }
export const clearDisplay = () => { setInnerHTML( 'osc-data-container', '' ) }

// MARK: osc Messages

export const buildOSCListenEvent = ( v : OSCListenEvent ) => { safeAppend( 'osc-data-container', oscBuildMessage( v ) ) }

export const replaceOSCListenEvent = ( v : OSCListenEvent ) => {
	if ( ! oscReplaceMessage( v ) ) {
		safeAppend( 'osc-data-container', oscBuildMessage( v ) )
	}
}

// eslint-disable-next-line @stylistic/newline-per-chained-call
const getHumanDate = ( v : Date ) => `${v.getHours().toString().padStart( 2, '0' )}:${v.getMinutes().toString().padStart( 2, '0' )}:${v.getSeconds().toString().padStart( 2, '0' )}.${v.getMilliseconds().toString().padStart( 3, '0' )}`

const oscBuildMessage = ( v : OSCListenEvent ) : string => {
	const humanDate   = getHumanDate( new Date( v.timestamp ) )
	const humanBundle = typeof v.bundleTime === 'number' ? v.timestamp - v.bundleTime : v.bundleTime

	return [
		OSCDisplayParts.start(
			v.name,
			v.message.address,
			v.address,
			v.port
		),
		OSCDisplayParts.timeStamp( humanDate ),
		OSCDisplayParts.bundleTime( humanBundle ),
		OSCDisplayParts.connection( v.name ),
		OSCDisplayParts.address( v.message.address ),
		'<div class="message-args">',
		...v.message.elements.map( ( item ) => OSCDisplayParts.arg( item ) ),
		'</div></div>'
	].join( '' )
}

const oscReplaceMessage = ( v : OSCListenEvent ) : boolean => {
	const current = document.querySelector( `div[data-address="${v.message.address}"][data-connection="${v.name}"]` )

	if ( current === null ) {
		return false
	}

	const humanDate   = getHumanDate( new Date( v.timestamp ) )

	if ( typeof v.bundleTime === 'number' || v.bundleTime === null ) {
		const bundleEle = current.querySelector( '.osc-bundle-stamp' )
		if ( bundleEle !== null ) {
			const content = OSCDisplayParts.bundleContent( v.bundleTime === null ? null : v.timestamp - v.bundleTime )
			bundleEle.classList.remove( 'osc-bundle-stamp-good', 'osc-bundle-stamp-bad' )
			bundleEle.classList.add( `osc-bundle-stamp-${content.className}` )
			bundleEle.innerHTML = content.text
		}
	}

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
	logLevel    : ( v : string ) => `<div class="osc-log-level osc-log-level-${v}">${v}</div>`,
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
	bundleContent : ( v : number | null ) => {
		return {
			className : v === null ? 'good' : v < 0 ? 'bad' : 'good',
			text      : v === null ? 'b:I' : `b:${v < 0 ? '' : '+'}${ v }ms`,
		}
	},
	bundleTime : ( v : number | null | boolean ) => {
		if ( v === true || v === false ) {
			return
		}
		const content = OSCDisplayParts.bundleContent( v )
		
		return `<div class="osc-bundle-stamp osc-bundle-stamp-${content.className}">${content.text}</div>`
	},
	
}

// MARK: osc tick
export const freqEntry = ( v : OSCListenFreqEvent ) => {
	const timeString     = `${( Math.round( v.average * 10 ) / 10 ).toFixed( 1 )} m/s`
	const sinceString    = ( v.since > 10000 ) ? '>10s' : `${( v.since / 1000 ).toFixed( 2 )}s`
	const thisColorClass = ! v.ever ? 'osc-tick-name-bad' : v.since > 10000 ? 'osc-tick-name-maybe' : 'osc-tick-name-good'
	const foundItem = document.querySelector( `[data-tick-time="${v.name}"]` )

	const nameText = v.tcpStatus === null || v.tcpStatus === true ? v.name : `<i class="bi bi-exclamation-triangle"></i> ${v.name}`

	if ( foundItem !== null ) {
		const nameItem = document.querySelector( `[data-tick-name="${v.name}"]` )
		if ( nameItem !== null && !nameItem.classList.contains( thisColorClass ) ) {
			nameItem.classList.remove( 'osc-tick-name-bad', 'osc-tick-name-good', 'osc-tick-name-maybe' )
			nameItem.classList.add( thisColorClass )
			nameItem.innerHTML = nameText
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
		`<div data-tick-name="${v.name}" class="${thisColorClass}">${nameText}</div>`,
		`<div data-tick-time="${v.name}" class="osc-tick-time">${timeString}</div>`,
		`<div data-tick-since="${v.name}" class="osc-tick-time">${sinceString}</div>`,
	].join( '' )

	safeAppend( 'osc-connection-container', thisDiv )
}

// MARK: main settings

export const makeDropDownCheck = ( dropName : string, value : string, inList : boolean = false ) => [
	'<div class="form-check form-switch mx-2">',
	`<input class="form-check-input" type="checkbox" role="switch" ${inList ? 'checked' : ''} value="${value}" name="${dropName}[]">`,
	`<label class="form-check-label">${value}</label>`,
	'</div>',
].join( '' )

// MARK: type utility
export type conType = 'listen' | 'sender' | 'both' | 'tcp-client'

export const conCanHear = ( connection : ConnectionDefTypes ) : connection is UDPListenerDef | UDPBothDef | TCPClientDef => conTypeCanHear( connection.type )
export const conTypeCanHear = ( type : conType ) => ( type === 'listen' || type === 'both' || type === 'tcp-client' )

export const conCanSend = ( connection : ConnectionDefTypes ) : connection is UDPSenderDef | UDPBothDef | TCPClientDef => conTypeCanSend( connection.type )
export const conTypeCanSend = ( type : conType ) => ( type === 'sender' || type === 'both' || type === 'tcp-client' )

export const conHasListen = ( connection : ConnectionDefTypes ) : connection is UDPListenerDef | UDPBothDef => conTypeHasListen( connection.type )
export const conTypeHasListen = ( type : conType ) => ( type === 'listen' || type === 'both' )

export const conHasSend   = ( connection : ConnectionDefTypes ) : connection is UDPSenderDef | UDPBothDef | TCPClientDef => conTypeHasSend( connection.type )
export const conTypeHasSend   = ( type : conType ) => ( type === 'sender' || type === 'both' || type === 'tcp-client' )

export const conIsTCP   = ( connection : ConnectionDefTypes ) : connection is TCPClientDef => conTypeIsTCP( connection.type )
export const conTypeIsTCP   = ( type : conType ) => ( type === 'tcp-client' )
