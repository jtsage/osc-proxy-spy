const Util = {
	TWO_POW_32 : 4294967296,
	UNIX_EPOCH : 2208988800,
	
	byId       : ( id ) => document.getElementById( id ),
	byIdHTML   : (id) => Util.byId(id).innerHTML,
	query      : ( query ) => document.querySelectorAll( query ),
	queryA     : ( query ) => [...document.querySelectorAll( query )],
	queryF     : ( query ) => document.querySelector(query),

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
}

const STATE = {
	addressFilter : '',
	hideEmpty     : false,
	hideTypes     : new Set(),
	oscStack      : [],
	paused        : false,
	showAll       : true,
	showTime      : false,
}

async function processI18N() {
	for ( const element of Util.queryA('[data-i18n-string') ) {
		window.i18n.string(element.textContent).then((value) => { element.textContent = value })
	}
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

const oscFormat = (thisArg) => {
	let className = 'osc-unknown'
	let showValue = thisArg.type.toUpperCase()


	if ( knownClass.has(thisArg.type) ) {
		const thisOne = knownClass.get(thisArg.type)
		className = thisOne.className
		showValue = thisOne.format(thisArg)
	} else if ( thisArg.type === 'color' ) {
		const color = `${thisArg.value[0]}, ${thisArg.value[1]}, ${thisArg.value[2]}, ${thisArg.value[3]/255}`
		return `<div class="osc-color" style="background-color: rgba(${color})">RGBa</div>`
	}

	return `<div class="${className}">${showValue}</div>`
}

const addOSC = (data) => {
	if ( STATE.hideEmpty && data.args.length === 0 ) { return }
	if ( STATE.addressFilter !== '' && data.address.indexOf(STATE.addressFilter) === -1 ) { return }

	const thisDiv     = document.createElement('div')
	const divContents = [
		`<div class="osc-name">${data.name}</div>`,
		`<div class="osc-address">${data.address}</div>`,
	]

	for ( const argItem of data.args ) {
		if ( STATE.hideTypes.has(argItem.type) ) { return }
		divContents.push(oscFormat(argItem))
	}
	
	if ( typeof data.bundleDate !== 'undefined' ) {
		const timeDiff = new Date(data.bundleDate) - new Date(data.date)
		if ( !STATE.showTime ) {
			divContents.unshift(`<div class="osc-bundle-stamp-${timeDiff < 0 ? 'bad' : 'good'}">b</div>`)
		} else {
			divContents.unshift(`<div class="osc-bundle-stamp-${timeDiff < 0 ? 'bad' : 'good'}">b ${timeDiff < 0 ? '':'+'}${timeDiff}ms</div>`)
		}
	}
	if ( STATE.showTime ) {
		divContents.unshift(`<div class="osc-timestamp">${Util.dateFormatter(new Date(data.date))}</div>`)
	}
	thisDiv.classList.add('data-osc')
	thisDiv.setAttribute('data-connection', data.name)
	thisDiv.setAttribute('data-address', data.address)
	thisDiv.innerHTML = divContents.join('')
	STATE.oscStack.push([thisDiv, data.name, data.address])
	updateOSCList()
}

const updateOSCList = () => {
	if ( ! STATE.paused ) {
		while ( STATE.oscStack.length !== 0 ) {
			const thisItem = STATE.oscStack.shift()
			if ( ! STATE.showAll ) {
				const foundItem = Util.queryF(`[data-address="${thisItem[2]}"][data-connection="${thisItem[1]}"]`)
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

window.osc.receive('osc-data', (data) => {
	if ( data.type === 'osc-message' )     { addOSC(data); return }
	else if ( data.type === 'osc-bundle' ) {
		for ( const element of data.elements ) {
			addOSC({
				bundleDate : data.timetag,
				date       : data.date,
				name       : data.name,
				...element,
			})
		}
		return
	}
	/* unknown message type */
})

window.addEventListener('DOMContentLoaded', () => {
	processI18N()
})

function clientDoClear() {
	Util.byId('osc-data-container').innerHTML = ''
}

function clientDoPause() {
	STATE.paused = !STATE.paused
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

function clientDoSingle() {
	STATE.showAll = !STATE.showAll
	if ( STATE.showAll ) {
		Util.byId('singleMode_off').classList.remove('d-none')
		Util.byId('singleMode_on').classList.add('d-none')
	} else {
		Util.byId('singleMode_off').classList.add('d-none')
		Util.byId('singleMode_on').classList.remove('d-none')
	}
	clientDoClear()
}

function clientDoDate() {
	STATE.showTime = !STATE.showTime
	if ( STATE.showTime ) {
		Util.byId('dateMode_off').classList.add('d-none')
		Util.byId('dateMode_on').classList.remove('d-none')
	} else {
		Util.byId('dateMode_off').classList.remove('d-none')
		Util.byId('dateMode_on').classList.add('d-none')
	}
}

function clientUpdateFilter() {
	STATE.addressFilter = Util.byId('address-limit').value
}

function clientChangeTypeFilter() {
	STATE.hideTypes = new Set()
	STATE.hideEmpty = false
	const skipTypes = Util.queryA('[name="selected_assets[]"]:checked')

	for ( const element of skipTypes ) {
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