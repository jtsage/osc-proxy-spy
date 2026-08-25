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
	const dropdownElementList = document.querySelectorAll( '.dropdown-toggle' )
	for ( const dropdownToggleEl of dropdownElementList ) { new bootstrap.Dropdown( dropdownToggleEl ) }

	util.listenToId( 'singleButton', 'click', () => {
		window.ipc.changeSetting( 'modeAll', !currentSettings.modeAll ).then( ( result ) => {
			clearDisplay()
			currentSettings = result
			updateSettings()
		} )
	} )
	util.listenToId( 'clearButton', 'click', () => clearDisplay() )
	util.listenToId( 'pauseButton', 'click', () => {
		isPaused = !isPaused
		updateSettings()
	} )
	util.listenToId( 'address-limit', 'change', () => {
		const newValue = util.getFormValue( 'address-limit' )
		window.ipc.changeSetting( 'matchTerm', newValue === '' ? null : newValue ).then( ( result ) => {
			clearDisplay()
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
} )

const updateLog = () => {
	window.ipc.getLogNew().then( ( result ) => {
		const logCon = util.getId( 'log-container' )
		for ( const item of result ) {
			const thisDiv = document.createElement( 'div' )
			thisDiv.classList.add( 'data-osc' )
			thisDiv.innerHTML = [
				util.OSCDisplayParts.timeStamp( ( new Date( item[0] ).toLocaleString() ) ),
				util.OSCDisplayParts.address( item[1] ),
				util.OSCDisplayParts.connection( item[2] ),
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
				util.OSCDisplayParts.connection( item[2] ),
				util.OSCDisplayParts.arg( { type : 'string', value : item[3] } ),
				'</div>'
			].join( '' )
		} )
		util.setInnerHTML( 'log-container', resultHTML.join( '\n' ) )
	} )
}

const clearDisplay = () => { util.setInnerHTML( 'osc-data-container', '' ) }
const updateSettings = () => {
	util.setFormValue( 'address-limit', currentSettings.matchTerm === null ? '' : currentSettings.matchTerm )

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
					clearDisplay()
					updateSettings()
				} )
			} )
	}


	const conNames = [
		...currentSettings.connections.filter( ( item ) => item.connectionPrime.type === 'listen' ).map( ( item ) => item.name )
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
					clearDisplay()
					updateSettings()
				} )
			} )
	}
}
