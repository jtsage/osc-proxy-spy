/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) JTSage <https://github.com/jtsage/osc-proxy-spy> */

// @ts-expect-error no types
import './scss/styles.scss'
import * as bootstrap from 'bootstrap'
import * as util from './util'
import { connectStartUp, parseConnections } from './connect'

import { IpcType } from '../preload'
import { UDPListenEvent, UDPListenFreqEvent } from 'src/lib/connection'
import { SettingsDef } from 'src/lib/settings'
import { OSCArgObject } from 'simple-osc-lib'
declare global { interface Window { ipc : IpcType } }

const skippableTypes : Array<OSCArgObject['type'] | 'other'> = [
	'string',
	'integer',
	'float',
	'double',
	'symbol',
	'other'
]

let sendModal    : bootstrap.Modal
let currentSettings : SettingsDef
let isPaused = false

window.ipc.receive( 'view', ( id : string ) => {
	const tabs    = document.querySelectorAll( '.page-tab-pane' )
	const thisTab = util.getId( `${id}-tab-pane` ) ?? util.getId( 'home-tab-pane' )

	for ( const element of tabs ) { element.classList.add( 'd-none' ) }
	util.safeClassRem( thisTab, 'd-none' )
	if ( id === 'log' ) {
		newLog()
	}
} )

window.ipc.receive( 'osc:data', ( data : UDPListenEvent ) => {
	if ( isPaused ) {
		return
	}
	if ( currentSettings.modeAll ) {
		util.buildUDPListenEvent( data )
	} else {
		util.replaceUDPListenEvent( data )
	}
} )

window.ipc.receive( 'osc:tick', ( data : UDPListenFreqEvent[] ) => { for ( const item of data ) { util.freqEntry( item ) } } )

document.addEventListener( 'DOMContentLoaded', () => {
	settingsStartup()
	connectStartUp()
}, { once : true } )

const settingsStartup = () => {
	const dropdownElementList = document.querySelectorAll( '.dropdown-toggle' )
	for ( const dropdownToggleEl of dropdownElementList ) { new bootstrap.Dropdown( dropdownToggleEl ) }

	sendModal = new bootstrap.Modal( '#send-add-modal' )

	util.listenToId( 'arg-add-cancel', 'click', () => { sendModal.hide() } )
	util.listenToId( 'send-button-send', 'click', () => {
		window.ipc.doSend().then( ( result ) => {
			if ( result ) {
				util.goodOperation()
			} else {
				util.badOperation()
			}
		} )
	} )
	util.listenToId( 'send-button-add', 'click', () => { sendModal.show() } )
	util.listenToId( 'send-button-clear', 'click', () => {
		window.ipc.changeSetting( 'sendArgs', [] ).then( ( result ) => {
			currentSettings = result
			updateSettings()
		} )
	} )

	util.listenToId( 'arg-add-process', 'click', () => {
		sendModal.hide()
		const thisType = util.getSelectValue( 'arg-add-type' )
		const thisValue = util.getFormValue( 'arg-add-value' )
		if ( thisType === null || thisValue === null ) return
		switch ( thisType ) {
			case 'string' :
				currentSettings.sendArgs.push( { type : 'string', value : thisValue } )
				break
			case 'integer' :
				currentSettings.sendArgs.push( { type : 'integer', value : parseInt( thisValue ) } )
				break
			case 'float' :
				currentSettings.sendArgs.push( { type : 'float', value : parseFloat( thisValue ) } )
				break
			case 'bigint' :
				currentSettings.sendArgs.push( { type : 'bigint', value : BigInt( parseInt( thisValue ) ) } )
				break
			case 'double' :
				currentSettings.sendArgs.push( { type : 'double', value : parseFloat( thisValue ) } )
				break
			default :
				break
		}
		window.ipc.changeSetting( 'sendArgs', currentSettings.sendArgs ).then( ( result ) => {
			currentSettings = result
			updateSettings()
		} )
	} )

	util.listenToId( 'singleButton', 'click', () => {
		window.ipc.changeSetting( 'modeAll', !currentSettings.modeAll ).then( ( result ) => {
			util.clearDisplay()
			currentSettings = result
			updateSettings()
		} )
	} )
	util.listenToId( 'clearButton', 'click', () => util.clearDisplay() )
	util.listenToId( 'pauseButton', 'click', () => {
		isPaused = !isPaused
		updateSettings()
	} )
	util.listenToId( 'address-limit', 'change', () => {
		const newValue = util.getFormValue( 'address-limit' )
		window.ipc.changeSetting( 'matchTerm', newValue === '' ? null : newValue ).then( ( result ) => {
			util.clearDisplay()
			currentSettings = result
			updateSettings()
		} )
	} )

	util.listenToId( 'send-address', 'change', () => {
		const newValue = util.getFormValue( 'send-address' )
		window.ipc.changeSetting( 'sendAddress', newValue === '' ? null : newValue ).then( ( result ) => {
			currentSettings = result
			updateSettings()
		} )
	} )

	util.listenToId( 'send-destination', 'change', () => {
		const newValue = util.getSelectValue( 'send-destination' )
		window.ipc.changeSetting( 'sendConnect', newValue === null || newValue === '-1' ? null : parseInt( newValue ) ).then( ( result ) => {
			currentSettings = result
			updateSettings()
		} )
	} )

	window.ipc.getSettings().then( ( result ) => {
		currentSettings = result
		updateSettings()
	} )
	setInterval( () => {
		const logTab = util.getId( 'log-tab-pane' )
		if ( logTab !== null && logTab.checkVisibility() ) {
			updateLog()
		}
	}, 1000 )
}

const updateLog = () => {
	window.ipc.getLogNew().then( ( result ) => {
		const logCon = util.getId( 'log-container' )
		for ( const item of result ) {
			const thisDiv = document.createElement( 'div' )
			thisDiv.classList.add( 'data-osc' )
			thisDiv.innerHTML = [
				util.OSCDisplayParts.timeStamp( ( new Date( item[0] ).toLocaleString() ) ),
				util.OSCDisplayParts.address( item[1] ),
				item[2] === null ? '' : util.OSCDisplayParts.connection( item[2] ),
				util.OSCDisplayParts.arg( { type : 'string', value : item[3] } ),
			].join( '' )
			if ( logCon !== null ) {
				logCon.appendChild( thisDiv )
			}
		}
	} )
}

const newLog = () => {
	window.ipc.getLogAll().then( ( result ) => {
		const resultHTML = result.map( ( item : string[] ) => {
			return [
				'<div class="data-osc">',
				util.OSCDisplayParts.timeStamp( ( new Date( item[0] ).toLocaleString() ) ),
				util.OSCDisplayParts.address( item[1] ),
				item[2] === null ? '' : util.OSCDisplayParts.connection( item[2] ),
				util.OSCDisplayParts.arg( { type : 'string', value : item[3] } ),
				'</div>'
			].join( '' )
		} )
		util.setInnerHTML( 'log-container', resultHTML.join( '\n' ) )
	} )
}

const updateSettings = () => {
	parseConnections( currentSettings )
	util.setFormValue( 'address-limit', currentSettings.matchTerm === null ? '' : currentSettings.matchTerm )
	util.setFormValue( 'send-address', currentSettings.sendAddress === null ? '' : currentSettings.sendAddress )

	if ( currentSettings.sendArgs.length !== 0 ) {
		util.setButtonEnabled( 'send-button-clear', true )
		const argHTML = currentSettings.sendArgs.map( ( x ) => util.OSCDisplayParts.arg( x ) )
		util.setInnerHTML( 'osc-add-args', argHTML.join( '' ) )
	} else {
		util.setButtonEnabled( 'send-button-clear', false )
		util.setInnerHTML( 'osc-add-args', '' )
	}

	util.setButtonEnabled( 'send-button-send', currentSettings.sendAddress !== null && currentSettings.sendConnect !== null )
	
	if ( currentSettings.modeAll ) {
		util.classRemove( 'singleMode_off', 'd-none' )
		util.classAdd( 'singleMode_on', 'd-none' )
	} else {
		util.classRemove( 'singleMode_on', 'd-none' )
		util.classAdd( 'singleMode_off', 'd-none' )
	}

	if ( isPaused ) {
		util.classAdd( 'pauseButton_go', 'd-none' )
		util.classRemove( 'pauseButton_stop', 'd-none' )
	} else {
		util.classRemove( 'pauseButton_go', 'd-none' )
		util.classAdd( 'pauseButton_stop', 'd-none' )
	}

	util.setInnerHTML( 'connection-type-filter', skippableTypes.map( ( item ) =>
		util.makeDropDownCheck(
			'selected_assets',
			item,
			currentSettings.excludeType.includes( item )
		)
	).join( '' ) )

	for ( const thisElement of util.queryAInput( '[name="selected_assets[]"]' ) ) {
		thisElement
			.addEventListener( 'click', () => {
				const newExcludeType = util.queryAInput( '[name="selected_assets[]"]:checked' )
					.map( ( item ) => item.value )
				
				window.ipc.changeSetting( 'excludeType', newExcludeType ).then( ( result ) => {
					currentSettings = result
					util.clearDisplay()
					updateSettings()
				} )
			} )
	}

	const conSelectIdx = currentSettings.sendConnect === null ? -1 : currentSettings.connections.length > currentSettings.sendConnect ? currentSettings.sendConnect : -1
	const conSelect    = [`<option value="-1" ${conSelectIdx === -1 ? 'selected' : ''}>n/a</option>`]

	for ( const [index, con] of currentSettings.connections.entries() ) {
		if ( con.connectionPrime.type !== 'listen' ) {
			conSelect.push( `<option value="${index}" ${conSelectIdx === index ? 'selected' : ''}>${con.name}</option>` )
		}
	}

	util.setInnerHTML( 'send-destination', conSelect.join( '' ) )

	const conNames = [
		...currentSettings.connections.filter( ( item ) => item.connectionPrime.type === 'listen' || item.connectionPrime.type === 'both' ).map( ( item ) => item.name )
	]

	util.setInnerHTML( 'connection-view-filter', conNames.map( ( item ) =>
		util.makeDropDownCheck(
			'selected_views',
			item,
			currentSettings.excludeConnection.includes( item )
		)
	).join( '' ) )

	for ( const thisElement of util.queryAInput( '[name="selected_views[]"]' ) ) {
		thisElement
			.addEventListener( 'click', () => {
				const newExcludeCon = util.queryAInput( '[name="selected_views[]"]:checked' )
					.map( ( item ) => item.value )
				
				window.ipc.changeSetting( 'excludeConnection', newExcludeCon ).then( ( result ) => {
					currentSettings = result
					util.clearDisplay()
					updateSettings()
				} )
			} )
	}
}
