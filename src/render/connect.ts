/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) JTSage <https://github.com/jtsage/osc-proxy-spy> */

import { SettingsDef } from 'src/lib/settings'
import * as util from './util'
import { ConnectionDef } from 'src/lib/connection'
import * as bootstrap from 'bootstrap'
import { FoundService } from 'src/main'


function isIPv4( ip : string ) {
	// Strict regex that enforces 4 octets ranging from 0 to 255 without leading zeros
	const ipv4Regex = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/

	return typeof ip === 'string' && ipv4Regex.test( ip )
}

const defaultNewCon : ConnectionDef = {
	connectionPrime : {
		listenAddress : '127.0.0.1',
		listenPort    : 1024,
		sendAddress   : '0.0.0.0',
		sendPort      : 1024,
		type          : 'both',
	},
	enabled              : false,
	forwarders           : [],
	name                 : 'new-connection',
	oscHeartBeatAddress  : null,
	oscHeartBeatArgs     : [],
	oscHeartBeatEnabled  : false,
	oscHeartBeatInterval : null,
}

type currentEditDef = {
	index : number,
	data  : ConnectionDef
} | null

type conType = 'listen' | 'sender' | 'both'

let currentEdit : currentEditDef = null
let conSettings : SettingsDef
let addModal    : bootstrap.Modal
let discModal   : bootstrap.Modal

// MARK: startup event binding
export const connectStartUp = () => {
	addModal = new bootstrap.Modal( '#connect-add-modal' )
	discModal = new bootstrap.Modal( '#connect-discover' )

	util.listenToId( 'connect-discover-button', 'click', () => {
		window.ipc.discover().then( ( results : Record<string, FoundService> ) => {
			util.setInnerHTML( 'connect-discover-modal-buttons', '' )
			const discHTML = document.createElement( 'div' )
			for ( const item of Object.values( results ) ) {
				const thisButton = document.createElement( 'button' )
				thisButton.classList.add( 'btn', 'btn-primary', 'mb-2', 'w-100' )
				thisButton.innerHTML = `${item.name} <small class="fst-italic">${item.address}:${item.port}`
				thisButton.addEventListener( 'click', () => {
					const newConNumber = conSettings.connections.length
					conSettings.connections[newConNumber] = {
						...defaultNewCon,
						connectionPrime : {
							sendAddress : item.address,
							sendPort    : item.port,
							type        : 'sender',
						},
						enabled : true,
						name    : item.safe_name,
					}
					parseConnections( conSettings )
					editConnection( newConNumber )
					discModal.hide()
				} )
				discHTML.append( thisButton )
			}
			util.safeAppend( 'connect-discover-modal-buttons', discHTML )
			discModal.show()
		} )
	} )
	
	util.listenToId( 'connect-add-button', 'click', () => {
		const newConNumber = conSettings.connections.length
		conSettings.connections[newConNumber] = { ...defaultNewCon }
		parseConnections( conSettings )
		editConnection( newConNumber )
	} )

	util.listenToId( 'connect-save-btn', 'click', ( e ) => {
		e.preventDefault()
		if ( saveOk() && currentEdit !== null ) {
			window.ipc.saveCon( currentEdit.index, currentEdit.data ).then( ( results ) => {
				conSettings = results
				editLockOut( false )
				parseConnections( conSettings )
				util.clearDisplay()
				util.goodOperation()
				if ( currentEdit !== null && typeof conSettings.connections[currentEdit.index] !== 'undefined' ) {
					viewConnection( currentEdit.index )
				} else {
					util.setInnerHTML( 'connect-number', '0' )
					util.classAdd( 'connect-actions', 'd-none' )
					const allData = document.querySelectorAll( '.connect-data-row' )

					for ( const element of allData ) {
						if ( element instanceof HTMLElement ) {
							element.classList.add( 'd-none' )
						}
					}
				}
			} )
		}
	} )

	util.listenToId( 'connect-delete-btn', 'click', () => {
		if ( currentEdit !== null ) {
			window.ipc.removeCon( currentEdit.index ).then( ( results ) => {
				conSettings = results
				editLockOut( false )
				parseConnections( conSettings )

				util.setInnerHTML( 'connect-number', '0' )
				util.classAdd( 'connect-actions', 'd-none' )
				const allData = document.querySelectorAll( '.connect-data-row' )

				for ( const element of allData ) {
					if ( element instanceof HTMLElement ) {
						element.classList.add( 'd-none' )
					}
				}
			} )
		}
	} )

	util.listenToId( 'connect-cancel-btn', 'click', ( e ) => {
		e.preventDefault()
		editLockOut( false )
		window.ipc.getSettings().then( ( results ) => {
			conSettings = results
			parseConnections( conSettings )
			if ( currentEdit !== null && typeof conSettings.connections[currentEdit.index] !== 'undefined' ) {
				viewConnection( currentEdit.index )
			} else {
				util.setInnerHTML( 'connect-number', '0' )
				util.classAdd( 'connect-actions', 'd-none' )
				const allData = document.querySelectorAll( '.connect-data-row' )

				for ( const element of allData ) {
					if ( element instanceof HTMLElement ) {
						element.classList.add( 'd-none' )
					}
				}
			}
		} )
	} )

	util.listenToId( 'connect-heart-clear', 'click', () => {
		if ( currentEdit !== null ) {
			currentEdit.data.oscHeartBeatArgs.length = 0
			updateConnectionData( currentEdit.data, currentEdit.index )
			unprotectConnection( currentEdit.data.connectionPrime.type )
		}
	} )

	util.listenToId( 'connect-heart-add', 'click', () => { addModal.show() } )

	util.listenToId( 'connect-add-process', 'click', () => {
		addModal.hide()
		const thisType = util.getSelectValue( 'connect-add-type' )
		const thisValue = util.getFormValue( 'connect-add-value' )
		if ( thisType === null || thisValue === null || currentEdit === null ) return
		switch ( thisType ) {
			case 'string' :
				currentEdit.data.oscHeartBeatArgs.push( { type : 'string', value : thisValue } )
				break
			case 'integer' :
				currentEdit.data.oscHeartBeatArgs.push( { type : 'integer', value : parseInt( thisValue ) } )
				break
			case 'float' :
				currentEdit.data.oscHeartBeatArgs.push( { type : 'float', value : parseFloat( thisValue ) } )
				break
			case 'bigint' :
				currentEdit.data.oscHeartBeatArgs.push( { type : 'bigint', value : BigInt( parseInt( thisValue ) ) } )
				break
			case 'double' :
				currentEdit.data.oscHeartBeatArgs.push( { type : 'double', value : parseFloat( thisValue ) } )
				break
			default :
				break
		}
		updateConnectionData( currentEdit.data, currentEdit.index )
		unprotectConnection( currentEdit.data.connectionPrime.type )
	} )

	util.listenToId( 'connect-add-fwd', 'click', () => {
		if ( currentEdit === null || currentEdit.data.connectionPrime.type !== 'both' ) return
		currentEdit.data.forwarders.push( { type : 'sender', sendAddress : '127.0.0.1', sendPort : 1024 } )
		updateConnectionData( currentEdit.data, currentEdit.index )
		unprotectConnection( currentEdit.data.connectionPrime.type )
	} )

	util.listenToId( 'connect-type', 'change', () => {
		if ( currentEdit !== null ) {
			currentEdit.data.connectionPrime.type = util.getSafeSelectValue( 'connect-type', currentEdit.data.connectionPrime.type ) as conType
			unprotectConnection( currentEdit.data.connectionPrime.type )
			saveOk()
		}
	} )

	util.listenToId( 'connect-name', 'change', () => {
		if ( currentEdit !== null ) {
			currentEdit.data.name = util.getSafeFormValue( 'connect-name', currentEdit.data.name )
			saveOk()
		}
	} )

	util.listenToId( 'connect-enabled', 'change', () => {
		if ( currentEdit !== null ) {
			currentEdit.data.enabled = ( util.getSafeSelectValue( 'connect-enabled', currentEdit.data.enabled ? '1' : '0' ) ) === '1'
			saveOk()
		}
	} )

	util.listenToId( 'connect-in-address', 'change', () => {
		if ( currentEdit !== null && ( currentEdit.data.connectionPrime.type === 'listen' || currentEdit.data.connectionPrime.type === 'both' ) ) {
			currentEdit.data.connectionPrime.listenAddress = util.getSafeSelectValue( 'connect-in-address', currentEdit.data.connectionPrime.listenAddress )
			saveOk()
		}
	} )

	util.listenToId( 'connect-in-port', 'change', () => {
		if ( currentEdit !== null && ( currentEdit.data.connectionPrime.type === 'listen' || currentEdit.data.connectionPrime.type === 'both' ) ) {
			const newPort = parseInt( util.getFormValue( 'connect-in-port' ) ?? '0' )
			if ( newPort > 1023 && newPort < 65536 ) {
				currentEdit.data.connectionPrime.listenPort = newPort
				saveOk()
			} else {
				saveOk( true )
			}
		}
	} )

	util.listenToId( 'connect-out-port', 'change', () => {
		if ( currentEdit !== null && ( currentEdit.data.connectionPrime.type === 'sender' || currentEdit.data.connectionPrime.type === 'both' ) ) {
			const newPort = parseInt( util.getFormValue( 'connect-out-port' ) ?? '0' )
			if ( newPort > 1023 && newPort < 65536 ) {
				currentEdit.data.connectionPrime.sendPort = newPort
				saveOk()
			} else {
				saveOk( true )
			}
		}
	} )

	util.listenToId( 'connect-out-address', 'change', () => {
		if ( currentEdit !== null && ( currentEdit.data.connectionPrime.type === 'sender' || currentEdit.data.connectionPrime.type === 'both' ) ) {
			const newAddress = util.getFormValue( 'connect-out-address' ) ?? ''
			if ( isIPv4( newAddress ) ) {
				currentEdit.data.connectionPrime.sendAddress = newAddress
				saveOk()
			} else {
				saveOk( true )
			}
		}
	} )

	util.listenToId( 'connect-heart-address', 'change', () => {
		if ( currentEdit !== null && ( currentEdit.data.connectionPrime.type === 'sender' || currentEdit.data.connectionPrime.type === 'both' ) ) {
			const newAddress = util.getFormValue( 'connect-heart-address' ) ?? ''
			currentEdit.data.oscHeartBeatAddress = newAddress === '' ? null : newAddress
			saveOk()
		}
	} )

	util.listenToId( 'connect-heart-enabled', 'change', () => {
		if ( currentEdit !== null ) {
			currentEdit.data.oscHeartBeatEnabled = ( util.getSafeSelectValue( 'connect-heart-enabled', currentEdit.data.oscHeartBeatEnabled ? '1' : '0' ) ) === '1'
			saveOk()
		}
	} )

	util.listenToId( 'connect-heart-interval', 'change', () => {
		if ( currentEdit !== null && ( currentEdit.data.connectionPrime.type === 'sender' || currentEdit.data.connectionPrime.type === 'both' ) ) {
			const newInterval = parseInt( util.getFormValue( 'connect-heart-interval' ) ?? '0' )
			if ( newInterval > 1023 && newInterval < 65536 ) {
				currentEdit.data.oscHeartBeatInterval = newInterval
				saveOk()
			} else {
				saveOk( true )
			}
		}
	} )
}

// MARK: con buttons
export const parseConnections = ( v : SettingsDef ) => {
	conSettings = v
	util.setInnerHTML( 'osc-connection-container', '' )
	util.setInnerHTML( 'connect-list', '' )

	for ( const [idx, item] of conSettings.connections.entries() ) {
		const btnGroup = document.createElement( 'div' )
		btnGroup.classList.add( 'btn-group', 'w-100', 'mb-1' )

		const viewButton = document.createElement( 'button' )
		viewButton.setAttribute( 'type', 'button' )
		viewButton.classList.add( 'btn', 'btn-primary', 'connect-view-btn', 'w-75' )
		viewButton.textContent = `${idx+1} : ${item.name}`
		viewButton.addEventListener( 'click', () => viewConnection( idx ) )
		btnGroup.append( viewButton )

		const editButton = document.createElement( 'button' )
		editButton.setAttribute( 'type', 'button' )
		editButton.classList.add( 'btn', 'btn-outline-primary', 'connect-edit-btn', 'w-25' )
		editButton.innerHTML = '<i class="bi bi-pencil-square"></i>'
		editButton.addEventListener( 'click', () => editConnection( idx ) )
		btnGroup.append( editButton )

		util.safeAppend( 'connect-list', btnGroup )
	}
}


// MARK: view con btn
const viewConnection = async( i : number ) => {
	currentEdit = null
	util.classAdd( 'connect-actions', 'd-none' )
	const thisConn = conSettings.connections[i]

	if ( thisConn === null ) return

	const networks = await window.ipc.networks()
	const networkHTML = networks.map( ( x : string ) => `<option value="${x}">${x}</option>` )
	util.setInnerHTML( 'connect-in-address', networkHTML.join( '' ) )

	updateConnectionData( thisConn, i )
	editLockOut( false )
	protectConnection()
}

// MARK: edit con btn
const editConnection = async( i : number ) => {
	await viewConnection( i )

	const thisConn = conSettings.connections[i]

	if ( thisConn === null ) return
	util.classRemove( 'connect-actions', 'd-none' )
	editLockOut( true )
	unprotectConnection( thisConn.connectionPrime.type )
	currentEdit = { index : i, data : thisConn }
}

// MARK: refresh data
const updateConnectionData = ( thisConn : ConnectionDef, i : number ) => {
	util.setInnerHTML( 'connect-number', String( i+1 ) )

	util.setFormValue( 'connect-name', thisConn.name )
	util.setSelectValue( 'connect-type', thisConn.connectionPrime.type )
	util.setSelectValue( 'connect-enabled', thisConn.enabled ? '1' : '0' )

	if ( thisConn.connectionPrime.type === 'listen' || thisConn.connectionPrime.type === 'both' ) {
		util.setSelectValue( 'connect-in-address', thisConn.connectionPrime.listenAddress )
		util.setFormValue( 'connect-in-port', String( thisConn.connectionPrime.listenPort ) )
	} else {
		util.setFormValue( 'connect-in-address', '0.0.0.0' )
		util.setFormValue( 'connect-in-port', '' )
	}

	if ( thisConn.connectionPrime.type === 'sender' || thisConn.connectionPrime.type === 'both' ) {
		util.setFormValue( 'connect-out-address', thisConn.connectionPrime.sendAddress )
		util.setFormValue( 'connect-out-port', String( thisConn.connectionPrime.sendPort ) )

		util.setSelectValue( 'connect-heart-enabled', thisConn.oscHeartBeatEnabled ? '1' : '0' )
		util.setFormValue( 'connect-heart-address', thisConn.oscHeartBeatAddress !== null ? thisConn.oscHeartBeatAddress : '' )
		util.setFormValue( 'connect-heart-interval', thisConn.oscHeartBeatInterval !== null ? String( thisConn.oscHeartBeatInterval ) : '' )
	} else {
		util.setFormValue( 'connect-out-address', '' )
		util.setFormValue( 'connect-out-port', '' )

		util.setSelectValue( 'connect-heart-enabled', '0' )
		util.setFormValue( 'connect-heart-address', '' )
		util.setFormValue( 'connect-heart-interval', '' )
	}

	const fwdHTML = thisConn.forwarders.map( ( x, idx ) => [
		`<div class="col-3 p-1 border"><input data-fwd-index="${idx}" id="connect-fwd-a-${idx}" pattern="^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$" name="fwd_address[]" type="text" class="form-control form-control-sm w-100 fwd-address" value="${x.sendAddress}"><div class="invalid-feedback">Invalid IP</div></div>`,
		`<div class="col-2 p-1 border"><input data-fwd-index="${idx}" id="connect-fwd-p-${idx}" min="1024" max="65535" name="fwd_port[]" type="number" class="form-control form-control-sm w-100 fwd-port" value="${x.sendPort}"><div class="invalid-feedback">1024-65535</div></div>`,
		`<div class="col-1 p-1 border text-center"><div class="btn btn-sm btn-danger fwd-delete" data-fwd-index="${idx}"><i class="bi bi-trash"></i></div></div>`,
		'<div class="col-6"></div>',
	].join( '' ) )
	util.setInnerHTML( 'connect-forwarders', fwdHTML.join( '' ) )

	const removeButtons = util.getId( 'connect-forwarders' )?.querySelectorAll( '.fwd-delete' )
	if ( removeButtons !== null && typeof removeButtons !== 'undefined' ) {
		for ( const element of removeButtons ) {
			element.addEventListener( 'click', ( e ) => {
				if ( e.currentTarget instanceof HTMLElement ) {
					const index = e.currentTarget.getAttribute( 'data-fwd-index' )
					if ( index !== null && currentEdit !== null ) {
						currentEdit.data.forwarders.splice( parseInt( index ), 1 )
						updateConnectionData( currentEdit.data, currentEdit.index )
					}
				}
			} )
		}
	}
	const fwdAddressFields = util.getId( 'connect-forwarders' )?.querySelectorAll( '.fwd-address' )
	const fwdPortFields    = util.getId( 'connect-forwarders' )?.querySelectorAll( '.fwd-port' )

	if ( fwdAddressFields !== null && typeof fwdAddressFields !== 'undefined' ) {
		for ( const element of fwdAddressFields ) {
			element.addEventListener( 'change', ( e ) => {
				if ( e.currentTarget instanceof HTMLInputElement && currentEdit !== null ) {
					const newAddress = e.currentTarget.value
					const index = parseInt( e.currentTarget.getAttribute( 'data-fwd-index' ) ?? '0' )
					if ( isIPv4( newAddress ) ) {
						currentEdit.data.forwarders[index].sendAddress = newAddress
						saveOk()
					} else {
						saveOk( true )
					}
				}
			} )
		}
	}

	if ( fwdPortFields !== null && typeof fwdPortFields !== 'undefined' ) {
		for ( const element of fwdPortFields ) {
			element.addEventListener( 'change', ( e ) => {
				if ( e.currentTarget instanceof HTMLInputElement && currentEdit !== null ) {
					const newPort = parseInt( e.currentTarget.value ?? '0' )
					const index   = parseInt( e.currentTarget.getAttribute( 'data-fwd-index' ) ?? '0' )
					if ( newPort > 1023 && newPort < 65536 ) {
						currentEdit.data.forwarders[index].sendPort = newPort
						saveOk()
					} else {
						saveOk( true )
					}
				}
			} )
		}
	}

	if ( thisConn.oscHeartBeatArgs.length !== 0 ) {
		const argHTML = thisConn.oscHeartBeatArgs.map( ( x ) => util.OSCDisplayParts.arg( x ) )
		util.setInnerHTML( 'connect-heart-args', argHTML.join( '' ) )
	} else {
		util.setInnerHTML( 'connect-heart-args', 'none' )
	}
}


// MARK: edit lock
const editLockOut = ( disabled : boolean ) => {
	const uiButtons = document.querySelectorAll( '.connect-view-btn, .connect-edit-btn, #connect-add-button' )
	for ( const element of uiButtons ) {
		if ( element instanceof HTMLButtonElement ) {
			element.disabled = disabled
		}
	}
}

// MARK: unprotect fields
const unprotectConnection = ( type : 'both' | 'listen' | 'sender' ) => {
	editLockOut( true )
	const allInputs = document.querySelectorAll( '#connect-tab input, #connect-tab select' )
	const buttons = document.querySelectorAll( '#connect-add-fwd, .fwd-delete, #connect-heart-actions' )
	
	for ( const element of buttons ) {
		if ( element instanceof HTMLElement ) {
			if ( type === 'both' ) {
				element.classList.remove( 'd-none' )
			} else {
				element.classList.add( 'd-none' )
			}
		}
	}

	for ( const element of allInputs ) {
		if ( element instanceof HTMLInputElement || element instanceof HTMLSelectElement ) {
			if ( element.id === 'connect-out-address' || element.id === 'connect-out-port' ) {
				// SENDER TYPES - OUT A:P
				element.disabled = ! ( type === 'both' || type === 'sender' )
			} else if ( element.id === 'connect-in-address' || element.id === 'connect-in-port' ) {
				// LISTENER TYPES - IN A:P
				element.disabled = ! ( type === 'both' || type === 'listen' )
			} else if ( element.id.startsWith( 'connect-fwd' ) || element.id.startsWith( 'connect-heart' ) ) {
				element.disabled = type !== 'both'
			} else {
				element.disabled = false
			}
		}
	}
}

// MARK: protect fields
const protectConnection = () => {
	const allData = document.querySelectorAll( '.connect-data-row' )

	for ( const element of allData ) {
		if ( element instanceof HTMLElement ) {
			element.classList.remove( 'd-none' )
		}
	}
	const allInputs = document.querySelectorAll( '#connect-tab input, #connect-tab select' )
	for ( const element of allInputs ) {
		if ( element instanceof HTMLInputElement || element instanceof HTMLSelectElement ) {
			element.disabled = true
		}
	}
	const buttons = document.querySelectorAll( '#connect-add-fwd, .fwd-delete, #connect-heart-actions' )
	for ( const element of buttons ) {
		if ( element instanceof HTMLElement ) {
			element.classList.add( 'd-none' )
		}
	}
}

// MARK: check if save
const saveOk = ( forceBad = false ) => {
	const theForm = util.getId( 'connect-form' )

	if ( theForm === null || ! ( theForm instanceof HTMLFormElement ) ) return
	
	const valid = theForm.checkValidity()

	theForm.classList.add( 'was-validated' )

	if ( ( ! valid ) || forceBad ) {
		const mainEle = util.getId( 'connect-tab' )
		if ( mainEle !== null ) {
			mainEle.classList.add( 'save-bad' )
			mainEle.addEventListener( 'animationend', () => { mainEle.classList.remove( 'save-bad' ) }, { once : true } )
		}
		return false
	}
	return true
}