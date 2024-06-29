/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) 2024 JTSage <https://github.com/jtsage/osc-proxy-spy> */
/* globals bootstrap */

let argumentModal = null

const Util = {
	TWO_POW_32 : 4294967296,
	UNIX_EPOCH : 2208988800,
	
	byId       : ( id ) => document.getElementById( id ),
	byIdHTML   : (id) => Util.byId(id).innerHTML,
	query      : ( query ) => document.querySelectorAll( query ),
	queryA     : ( query ) => [...document.querySelectorAll( query )],
	queryF     : ( query ) => document.querySelector(query),

	queryOSC   : ( address, connection ) => Util.queryF(`[data-address="${address}"][data-connection="${connection}"]`),

	dateFormatter : (date) => {
		return [
			date.getFullYear(), '-',
			Util.zPad(date.getMonth() + 1), '-',
			Util.zPad(date.getDate()), ' ',
			Util.zPad(date.getHours()), ':',
			Util.zPad(date.getMinutes()), ':',
			Util.zPad(date.getSeconds()), '.',
			Util.zPad(date.getMilliseconds(), 3)
		].join('')
	},
	formatTimeTag : (timetag) => {
		if ( !Array.isArray(timetag) || timetag.length !== 2 || typeof timetag[0] !== 'number' || typeof timetag[1] !== 'number') {
			return 'invalid'
		}
		const seconds    = timetag[0] - Util.UNIX_EPOCH
		const fractional = parseFloat(timetag[1]) / Util.TWO_POW_32
		const returnDate = new Date()

		returnDate.setTime((seconds * 1000) + (fractional * 1000))

		return Util.dateFormatter(returnDate)
	},
	zPad : (num, places = 2) => num.toString().padStart(places, '0'),

	oscArgHTML : (thisArg) => {
		const fmtArg = Util.oscUnpack(thisArg)
		return `<div class="${fmtArg.className}" title="${fmtArg.title} "style="${fmtArg.style}">${fmtArg.valueText}</div>`
	},
	oscArgNode : (thisArg) => {
		const fmtArg = Util.oscUnpack(thisArg)
		const element = document.createElement('div')
		element.classList.add(fmtArg.className)
		element.setAttribute('title', fmtArg.title)
		element.setAttribute('style', fmtArg.style)
		element.textContent = fmtArg.valueText
		return element
	},
	oscPartHTML : (partName, value) => `<div class="osc-${partName}">${value}</div>`,
	oscUnpack : (thisArg) => {
		const returnObject = {
			className : 'osc-unknown',
			style     : '',
			title     : thisArg.type,
			valueText : thisArg.type.toUpperCase(),
		}

		if ( knownClass.has(thisArg.type) ) {
			const thisOne = knownClass.get(thisArg.type)
			returnObject.className = thisOne.className
			returnObject.valueText = thisOne.format(thisArg)
		} else if ( thisArg.type === 'color' ) {
			const color = `${thisArg.value[0]}, ${thisArg.value[1]}, ${thisArg.value[2]}, ${thisArg.value[3]/255}`
			returnObject.className = 'osc-color'
			returnObject.style     = `background-color: rgba(${color})`
			returnObject.title     = color
			returnObject.valueText = 'RGBa'
		}

		return returnObject
	},

	makeDropDownCheck : (dropName, value, itemName) => [
		'<div class="form-check form-switch mx-2">',
		`<input class="form-check-input" type="checkbox" role="switch" value="${value}" name="${dropName}[]">`,
		`<label class="form-check-label">${itemName}</label>`,
		'</div>',
	].join(''),

	doNullString : (value) => value === null ? '' : value,

}

const STATE = {
	addressFilter : '',
	hideCons      : new Set(),
	hideEmpty     : false,
	hideTypes     : new Set(),
	oscStack      : [],
	paused        : false,
	showAll       : true,
	showTime      : false,

	sendConnect   : [null, [], [], [], [], [], [], [], []],
	sendMain      : [],
}

const knownClass = new Map([
	['string', { className : 'osc-string', format : (arg) => arg.value }],
	['integer', { className : 'osc-integer', format : (arg) => arg.value }],
	['bigint', { className : 'osc-integer64', format : (arg) => arg.value }],
	['float', { className : 'osc-float', format : (arg) => arg.value.toFixed(4) }],
	['double', { className : 'osc-float64', format : (arg) => arg.value.toFixed(4) }],
	['blob', { className : 'osc-blob', format : () => '&lt;blob>' }],
	['bang', { className : 'osc-null', format : () => 'I' }],
	['true', { className : 'osc-null', format : () => 'T' }],
	['false', { className : 'osc-null', format : () => 'F' }],
	['null', { className : 'osc-null', format : () => 'N' }],
	['char', { className : 'osc-char', format : (arg) => arg.value }],
	['timetag', { className : 'osc-timetag', format : (arg) => Util.formatTimeTag(arg.value)}]
])

const typeFilters = [
	'no arguments',
	'strings',
	'integers',
	'floats',
	'nulls',
	'other',
]

function clientFormSave(e) {
	e.preventDefault()

	const thisForm       = e.target.tagName === 'BUTTON' ? e.target.form : e.target.parentElement.form

	if ( ! thisForm.checkValidity() ) { thisForm.reportValidity(); return }

	const connectSend = {
		number : parseInt(thisForm.id.slice(8, 11)),
		data   : {},
	}

	for ( const [key, value] of new FormData(thisForm) ) {
		connectSend.data[key.slice(12)] = value
	}

	connectSend.data.active = (connectSend.data?.active === 'on')
	connectSend.data['shared-socket'] = (connectSend.data?.['shared-socket'] === 'on')
	connectSend.data['heartbeat-args'] = STATE.sendConnect[connectSend.number]

	
	window.settings.setConnection(connectSend).then((result) => {
		const opDiv = result ? 'operation-good' : 'operation-bad'
		Util.byId(opDiv).classList.remove('d-none')
		Util.byId(opDiv).classList.replace('hide', 'show')
		
		setTimeout(() => { Util.byId(opDiv).classList.replace('show', 'hide')}, 1000)
		setTimeout(() => { Util.byId(opDiv).classList.add('d-none')}, 1175)
	})
}

function clientFormBlur(e) {
	const thisElement    = e.target.id
	const thisValue      = e.target.value
	const thisForm       = e.target.form
	const thisFormPrefix = e.target.form.id.slice(0, 11)

	if ( ! thisForm.checkValidity() ) { thisForm.reportValidity(); return }

	if ( thisElement.endsWith('-name') && thisValue !== '' ) {
		Util.byId(`${thisFormPrefix}-active`).checked = true
	}

	if ( thisElement.endsWith('-shared-socket') && thisValue !== 'on' ) { return }
	if (
		( thisElement.endsWith('-in-port') || thisElement.endsWith('-out-port') || thisElement.endsWith('-shared-socket') ) &&
		( Util.byId(`${thisFormPrefix}-in-port`).value !== Util.byId(`${thisFormPrefix}-out-port`).value )
	) {
		Util.byId(`${thisFormPrefix}-shared-socket`).checked = false
	}
}

function populateConnection(number, details) {
	const prefix = `connect-00${number}`
	for ( const [key, value] of Object.entries(details) ) {
		switch ( key ) {
			case 'name' :
				Util.byId(`${prefix}-name`).value = Util.doNullString(value)
				break
			case 'isActive' :
				Util.byId(`${prefix}-active`).checked = value
				break
			case 'sharedSocket' :
				Util.byId(`${prefix}-shared-socket`).checked = value
				break
			case 'portIn' :
				Util.byId(`${prefix}-in-port`).value = Util.doNullString(value)
				break
			case 'portOut' :
				Util.byId(`${prefix}-out-port`).value = Util.doNullString(value)
				break
			case 'addressIn' :
				if ( value === null ) { continue }
				Util.byId(`${prefix}-in-address`).value = value
				break
			case 'addressOut' :
				Util.byId(`${prefix}-out-address`).value = Util.doNullString(value)
				break
			case 'proxyInPort' :
				Util.byId(`${prefix}-proxy-in-port`).value = Util.doNullString(value)
				break
			case 'proxyInAddress' :
				if ( value === null ) { continue }
				Util.byId(`${prefix}-proxy-in-address`).value = value
				break
			case 'heartbeatTime' :
				Util.byId(`${prefix}-heartbeat-time`).value = Util.doNullString(value)
				break
			case 'heartbeatAddress' :
				Util.byId(`${prefix}-heartbeat-address`).value = Util.doNullString(value)
				break
			default:
				break
		}
	}
	for ( let i = 0; i <= 2; i++ ) {
		const thisProxyPair = details?.proxyPairs[i]
		
		Util.byId(`${prefix}-proxy-00${i+1}-port`).value    = Util.doNullString(thisProxyPair?.port ?? null)
		Util.byId(`${prefix}-proxy-00${i+1}-address`).value = Util.doNullString(thisProxyPair?.address ?? null)
	}

	STATE.sendConnect[number] = details.heartbeatArgs
	doBuildArgs()
}

async function processI18N() {
	for ( const element of Util.queryA('[data-i18n-string') ) {
		window.i18n.string(element.textContent).then((value) => { element.textContent = value })
	}
}

function addOSC(data) {
	if ( STATE.hideEmpty && data.args.length === 0 ) { return }
	if ( STATE.addressFilter !== '' && data.address.indexOf(STATE.addressFilter) === -1 ) { return }
	if ( STATE.hideCons.has(data.name) ) { return }

	const thisName    = data.proxyIn ? `${data.name}-proxy` : data.name
	const thisDiv     = document.createElement('div')
	const divContents = [
		Util.oscPartHTML('name', thisName),
		Util.oscPartHTML('address', data.address)
	]

	for ( const argItem of data.args ) {
		if ( STATE.hideTypes.has(argItem.type) ) { return }
		divContents.push(Util.oscArgHTML(argItem))
	}
	
	if ( typeof data.bundleDate !== 'undefined' ) {
		const timeDiff = new Date(data.bundleDate) - new Date(data.date)
		const partName = `bundle-stamp-${timeDiff < 0 ? 'bad' : 'good'}`
		if ( !STATE.showTime ) {
			divContents.unshift(Util.oscPartHTML(partName, 'b'))
		} else {
			divContents.unshift(Util.oscPartHTML(partName, `b ${timeDiff < 0 ? '':'+'}${timeDiff}ms`))
		}
	}
	if ( STATE.showTime ) {
		divContents.unshift(Util.oscPartHTML('timestamp', Util.dateFormatter(new Date(data.date))))
	}
	thisDiv.classList.add('data-osc')
	thisDiv.setAttribute('data-connection', thisName)
	thisDiv.setAttribute('data-address', data.address)
	thisDiv.innerHTML = divContents.join('')
	STATE.oscStack.push([thisDiv, thisName, data.address])
	updateOSCList()
}

function updateOSCList() {
	if ( ! STATE.paused ) {
		while ( STATE.oscStack.length !== 0 ) {
			const thisItem = STATE.oscStack.shift()
			if ( ! STATE.showAll ) {
				const foundItem = Util.queryOSC(thisItem[2], thisItem[1])
				if ( foundItem !== null ) {
					foundItem.innerHTML = thisItem[0].innerHTML
					continue
				}
			}
			Util.byId('osc-data-container').appendChild(thisItem[0])
			Util.byId('osc-data-container').scroll(0, 100000)
		}
	}
}

function doClear() {
	Util.byId('osc-data-container').innerHTML = ''
	Util.byId('osc-connection-container').innerHTML = ''
}
function doPause(_e, force = null) {
	STATE.paused = force !== null ? force : !STATE.paused
	if ( STATE.paused ) {
		Util.byId('pauseButton').classList.replace('btn-success', 'btn-danger')
		Util.byId('pauseButton_go').classList.add('d-none')
		Util.byId('pauseButton_stop').classList.remove('d-none')
	} else {
		Util.byId('pauseButton').classList.replace('btn-danger', 'btn-success')
		Util.byId('pauseButton_go').classList.remove('d-none')
		Util.byId('pauseButton_stop').classList.add('d-none')
		updateOSCList()
	}
}
function doSingle() {
	window.settings.toggle('showEachMessage').then((value) => { updateSingle(value) })
}
function updateSingle(value) {
	STATE.showAll = value
	if ( STATE.showAll ) {
		Util.byId('singleMode_off').classList.remove('d-none')
		Util.byId('singleMode_on').classList.add('d-none')
	} else {
		Util.byId('singleMode_off').classList.add('d-none')
		Util.byId('singleMode_on').classList.remove('d-none')
	}
	doClear()
}
function doDate() {
	window.settings.toggle('showDateInfo').then((value) => { updateDate(value) })
}
function updateDate(value) {
	STATE.showTime = value
	if ( STATE.showTime ) {
		Util.byId('dateMode_off').classList.add('d-none')
		Util.byId('dateMode_on').classList.remove('d-none')
	} else {
		Util.byId('dateMode_off').classList.remove('d-none')
		Util.byId('dateMode_on').classList.add('d-none')
	}
}
function doViewFilter() {
	STATE.hideCons = new Set()

	for ( const element of Util.queryA('[name="selected_views[]"]:checked') ) {
		STATE.hideCons.add(element.value)
	}
}
function doTypeFilter() {
	STATE.hideTypes = new Set()
	STATE.hideEmpty = false

	for ( const element of Util.queryA('[name="selected_assets[]"]:checked') ) {
		switch (element.value) {
			case 'empty' :
				STATE.hideEmpty = true; break
			case 'strings' :
				STATE.hideTypes.add('string')
				STATE.hideTypes.add('char')
				break
			case 'integers' :
				STATE.hideTypes.add('integer')
				STATE.hideTypes.add('bigint')
				break
			case 'floats' :
				STATE.hideTypes.add('float')
				STATE.hideTypes.add('double')
				break
			case 'nulls' :
				STATE.hideTypes.add('true')
				STATE.hideTypes.add('false')
				STATE.hideTypes.add('bang')
				STATE.hideTypes.add('null')
				break
			case 'other' :
				STATE.hideTypes.add('blob')
				STATE.hideTypes.add('color')
				STATE.hideTypes.add('timetag')
				break
			default :
				break
		}
	}
}

function buildTypeFilters() {
	const typeFiltersPromise = []

	for ( const thisElement of typeFilters ) {
		typeFiltersPromise.push(
			window.i18n.string(thisElement).then((stringName) =>
				Util.makeDropDownCheck('selected_assets', thisElement, stringName)
			)
		)
	}

	Promise.allSettled(typeFiltersPromise).then((promises) => {
		Util.byId('connection-type-filter').innerHTML = promises.map((x) => x.value).join('')
		for ( const thisElement of Util.queryA('[name="selected_assets[]"]') ) {
			thisElement.addEventListener('click', doTypeFilter)
		}
	})
}

function buildViewFilters() {
	const connectionPromises = []
	for ( let i = 1; i <= 8; i++ ) {
		connectionPromises.push(window.settings.getConnection(i).then((details) => ({
			filter : !details.isActive ?
				'' :
				Util.makeDropDownCheck('selected_views', details.name, details.name),
			send   : !details.isActive || details.portOut === null ?
				null :
				`<option value="${i}">${details.name}</option>`,
		})))
	}

	Promise.allSettled(connectionPromises).then((promises) => {
		Util.byId('connection-view-filter').innerHTML = promises.map((x) => x.value.filter).join('')
		Util.byId('send-destination').innerHTML = promises.map((x) => x.value.send).filter((x) => x !== null).join('')
		for ( const thisElement of Util.queryA('[name="selected_views[]"]') ) {
			thisElement.addEventListener('click', doViewFilter)
		}
	})
}

async function buildConnectionForms() {
	const connectionSettingTemplate = Util.byId('connection-template').innerHTML
	const networkList               = await window.settings.networks()
	const networkDropHTML           = networkList.map((x) => `<option value="${x}">${x}</option>`)

	for ( let i = 1; i <= 8; i++ ) {
		Util.byId(`connect-00${i}`).innerHTML = connectionSettingTemplate.replaceAll('-000-', `-00${i}-`)
		Util.byId(`connect-00${i}-button-add`).addEventListener('click', () => { doArgOpenModal(i) })
		for ( const selectElement of Util.queryA(`#connect-00${i} .network-drop`) ) {
			selectElement.innerHTML = networkDropHTML
		}
		window.settings.getConnection(i).then((details) => { populateConnection(i, details) })
	}

	for ( const element of Util.byId('connect-tab-pane').getElementsByTagName('input')) {
		element.addEventListener('blur', (e) => clientFormBlur(e))
	}
	for ( const element of Util.byId('connect-tab-pane').querySelectorAll('button[type="submit"]')) {
		element.addEventListener('click', (e) => {clientFormSave(e)})
	}
}

function doAddClear() {
	STATE.sendMain = []
	Util.byId('send-address').value = ''
	Util.byId('send-button-clear').classList.add('disabled')
	Util.byId('send-button-send').classList.add('disabled')
	doBuildArgs()
}
function doAddUserType(e) {
	if ( e.target.value !== '' ) {
		Util.byId('send-button-clear').classList.remove('disabled')
		Util.byId('send-button-send').classList.remove('disabled')
	} else {
		Util.byId('send-button-clear').classList.add('disabled')
		Util.byId('send-button-send').classList.add('disabled')
	}
}
function doArgOpenModal(destination) {
	Util.byId('arg-add-value').value = ''
	Util.byId('arg-add-type').value = '0'
	Util.byId('arg-add-destination').value = destination.toString()
	Util.byId('arg-add-process').classList.add('disabled')
	argumentModal.show()
}
function doArgCloseModal() {
	Util.byId('arg-add-value').value = ''
	Util.byId('arg-add-type').value = '0'
	Util.byId('arg-add-destination').value = '0'
	Util.byId('arg-add-process').classList.add('disabled')
}
function doArgInputChange() {
	if ( Util.byId('arg-add-type').value === '0' || Util.byId('arg-add-value').value === '' ) {
		Util.byId('arg-add-process').classList.add('disabled')
	} else {
		Util.byId('arg-add-process').classList.remove('disabled')
	}
}
function doArgProcess() {
	const thisDestination = parseInt(Util.byId('arg-add-destination').value)
	const thisArg = {
		type  : Util.byId('arg-add-type').value,
		value : Util.byId('arg-add-value').value,
	}

	switch (thisArg.type) {
		case 'integer' :
			thisArg.value = parseInt(thisArg.value)
			break
		case 'bigint':
			thisArg.value = BigInt(thisArg.value)
			break
		case 'float':
		case 'double':
			thisArg.value = parseFloat(thisArg.value)
			break
		default:
			break
	}

	if ( thisDestination === 0 ) {
		STATE.sendMain.push(thisArg)
	} else {
		STATE.sendConnect[thisDestination].push(thisArg)
	}
	argumentModal.hide()
	doBuildArgs()
}
function doBuildArgs() {
	Util.byId('osc-add-args').innerHTML = ''
	for ( const [i, argObj] of Object.entries(STATE.sendMain) ) {
		const element = Util.oscArgNode(argObj)

		Util.byId('osc-add-args').appendChild(element)
		element.addEventListener('click', () => { doDeleteArg(0, parseInt(i)) })
	}
	for ( let con = 1; con <= 8; con++ ) {
		Util.byId(`connect-00${con}-args`).innerHTML = ''
		for ( const [i, argObj] of Object.entries(STATE.sendConnect[con]) ) {
			const element = Util.oscArgNode(argObj)

			Util.byId(`connect-00${con}-args`).appendChild(element)
			element.addEventListener('click', () => { doDeleteArg(con, parseInt(i)) })
		}
	}
}
function doDeleteArg(destination, index) {
	if ( destination === 0 ) {
		STATE.sendMain.splice(index, 1)
	} else {
		STATE.sendConnect[destination].splice(index, 1)
	}
	doBuildArgs()
}
function doAddSend() {
	const connectionNum = parseInt(Util.byId('send-destination').value)
	const messageObj = {
		address : Util.byId('send-address').value,
		args    : STATE.sendMain,
	}
	window.osc.send(connectionNum, messageObj).then((result) => {
		const opDiv = result ? 'operation-good' : 'operation-bad'
		Util.byId(opDiv).classList.remove('d-none')
		Util.byId(opDiv).classList.replace('hide', 'show')
		
		setTimeout(() => { Util.byId(opDiv).classList.replace('show', 'hide')}, 500)
		setTimeout(() => { Util.byId(opDiv).classList.add('d-none')}, 675)
	})
}

window.addEventListener('DOMContentLoaded', () => {
	Util.byId('pauseButton').addEventListener('click', doPause)
	Util.byId('clearButton').addEventListener('click', doClear)
	Util.byId('singleButton').addEventListener('click', doSingle)
	Util.byId('dateButton').addEventListener('click', doDate)
	Util.byId('address-limit').addEventListener('keyup', (e) => { STATE.addressFilter = e.target.value })
	Util.byId('send-address').addEventListener('keyup', doAddUserType)
	Util.byId('send-button-clear').addEventListener('click', doAddClear)
	Util.byId('send-button-send').addEventListener('click', doAddSend)
	Util.byId('arg-add-process').addEventListener('click', doArgProcess)
	Util.byId('arg-add-type').addEventListener('change', doArgInputChange)
	Util.byId('arg-add-value').addEventListener('keyup', doArgInputChange)
	Util.byId('send-button-add').addEventListener('click', () => { doArgOpenModal(0) })

	buildTypeFilters()
	buildViewFilters()
	buildConnectionForms()

	Util.byId('osc-data-container').addEventListener('wheel', (e) => {
		if ( STATE.paused ) { return }
		if ( e.deltaY > 0 ) { return }
		if ( Util.byId('osc-data-container').scrollHeight < Util.byId('osc-data-container').offsetHeight ) { return }
		doPause(true)
	})

	Util.byId('osc-data-container').addEventListener('mousedown', (e) => {
		if ( Util.byId('osc-data-container').scrollHeight < Util.byId('osc-data-container').offsetHeight ) { return }
		if ( e.clientX > ( e.target.clientWidth +  e.target.offsetLeft ) ) {
			doPause(true)
		}
	})

	window.settings.get('showDateInfo').then((value) => { updateDate(value) })
	window.settings.get('showEachMessage').then((value) => { updateSingle(value) })

	const argumentModalElement = Util.byId('send-add-modal')
	argumentModal = new bootstrap.Modal(argumentModalElement)

	argumentModalElement.addEventListener('hidden.bs.modal', doArgCloseModal)

	processI18N()
})

window.settings.receive('settings:refresh', () => {
	window.settings.reopenConnections()
	buildViewFilters()
	buildConnectionForms()
	doClear()
})

window.settings.receive('settings:showWindow', (winName) => {
	Util.queryF('.page-tab-pane:not(.d-none)').classList.add('d-none')
	Util.byId(`${winName}-tab-pane`).classList.remove('d-none')
})

window.osc.receive('osc:tick', (time, since, working, connectName) => {
	const timeString     = `${(Math.round(time * 10) / 10).toFixed(1)} m/s`
	const sinceString    = ( since > 10000 ) ? '>10s' : `${(since/1000).toFixed(2)}s`
	const thisColorClass = !working ? 'osc-tick-name-bad' : since > 10000 ? 'osc-tick-name-maybe' : 'osc-tick-name-good'
	const foundItem = Util.queryF(`[data-tick-time="${connectName}"]`)
	if ( foundItem !== null ) {
		const nameItem = Util.queryF(`[data-tick-name="${connectName}"]`)
		if ( !nameItem.classList.contains(thisColorClass) ) {
			nameItem.classList.remove('osc-tick-name-bad', 'osc-tick-name-good', 'osc-tick-name-maybe')
			nameItem.classList.add(thisColorClass)
		}
		foundItem.textContent = timeString
		Util.queryF(`[data-tick-since="${connectName}"]`).textContent = sinceString
		
		return
	}
	
	const thisDiv = document.createElement('div')
	thisDiv.innerHTML = [
		`<div data-tick-name="${connectName}" class="${thisColorClass}">${connectName}</div>`,
		`<div data-tick-time="${connectName}" class="osc-tick-time">${timeString}</div>`,
		`<div data-tick-since="${connectName}" class="osc-tick-time">${sinceString}</div>`,
	].join('')
	Util.byId('osc-connection-container').appendChild(thisDiv)

	const infoHeight = Util.byId('osc-connection-info').offsetHeight
	const bodyHeight = document.body.offsetHeight
	Util.byId('osc-data-container').style.maxHeight = `calc(${Math.floor(bodyHeight - infoHeight)}px - 1rem)`
})

window.osc.receive('osc:data', (data) => {
	if ( data.type === 'osc-message' )     { addOSC(data); return }
	else if ( data.type === 'osc-bundle' ) {
		for ( const element of data.elements ) {
			addOSC({
				bundleDate : data.timetag,
				date       : data.date,
				name       : data.name,
				proxyIn    : data.proxyIn,
				...element,
			})
		}
		return
	}
})