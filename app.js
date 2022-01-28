const http = require('http');
const fs = require('fs');
const fsP = fs.promises;
const { spawn } = require('child_process');

const hostname = '192.168.0.199';
const port = 3000;

const server = http.createServer((req, res) => {

	let url = req.url;
	let args = '';
	if (url.indexOf("?") > -1) {
		
		let urlArgs = url.split('?');
		url = urlArgs[0];
		
		if (urlArgs.length == 2 && urlArgs[1]) {
			args = urlArgs[1];
			
			args = args.split('&');
			let keyVal = {};
			for (let i = 0; i < args.length; i++) {
				let kv = args[i].split('=');
				keyVal[kv[0]] = kv[1];
				//console.log(keyVal);
			}
			args = keyVal;
			console.log(args);
		
		}
	}
	
	// Trim off tailing '/'
	if (url.endsWith('/')) {
		url = url.substring(0,url.length - 1);
	}
	//console.log(`Requested URL: ${url}`);
		
	
	if(url === '/dashboard' || url.startsWith('/dashboard')) {
		(async () => {
			await setLive(false);
			
			let dashGroup = url.lastIndexOf('/');
			if (dashGroup > -1) {
				dashGroup = url.substring(dashGroup + 1);
			} else {
				dashGroup = 'default';
			}
			
			if (dashGroup == 'dashboard') {
				dashGroup = 'default';
			}
			
			if (args.hasOwnProperty('create') && args.create && dashGroup == 'default') {
				
				(async () => {
					let dashName = decodeURIComponent(args.create);
					let cleanDashboard = dashName.replace(/[^a-zA-Z0-9-_()]/gm,'-');
					cleanDashboard = cleanDashboard.replace(/(^-*)|(-*$)/g,'');
					
					let resultObj = {success: true, dashboard: cleanDashboard};
					
					try {
						await saveDashboard(dashName, cleanDashboard);
					} catch(e) {
						resultObj.success = false;
						console.log(`Error saving dashboard for ${dashName}`);
					}
					
					resultObj = JSON.stringify(resultObj);
					
					res.statusCode = 200;
					res.setHeader('Content-Type', 'application/json');
					res.end(resultObj);
				})();
				
			} else if (args.hasOwnProperty('list') && dashGroup == 'default') {
				
				(async () => {
					let dashboards;
					
					try {
						dashboards = await loadDashboards();
					} catch(e) {
						dashboards = [];
					}
					
					dashboards = JSON.stringify(dashboards);
					
					res.statusCode = 200;
					res.setHeader('Content-Type', 'application/json');
					res.end(dashboards);
				})();
				
			} else {
				let htmlfile;
				try {
					htmlfile = await fsP.readFile("dashboard.html","utf8");
					console.log(`Responding with dashboard: ${dashGroup}`);
				    htmlfile = htmlfile.replace("var widgetGroup = 'default';", `var widgetGroup = '${dashGroup}';`);
				    htmlfile = htmlfile.replace("let serverIP = '0.0.0.0:0';", `let serverIP = '${hostname}:${port}';`);
				    
				} catch (err) {
					console.log(`Error loading dashboard.html`);
					htmlfile = "<i>Error loading dashboard.</i>";
				}
				
				res.statusCode = 200;
				res.setHeader('Content-Type', 'text/html');
				res.end(htmlfile);
			}
		})();
		
	} else if (url === '/widget') {
	
		(async () => {
			let data;
			
			try {
				await fsP.writeFile("busy.txt", 'false');
			} catch(err) {			
				console.log(`Error writing busy.txt: ${err}`);
			}
			
			try {
			    data = await fsP.readFile("widget.html","utf8");
			    data = data.replace("let serverIP = '0.0.0.0:0';", `let serverIP = '${hostname}:${port}';`);
			} catch(err) {
				console.log('Error loading widget.html');
				data = '<i>Error loading widget.</i>';
			}
			
			res.statusCode = 200;
			res.setHeader('Content-Type', 'text/html');
			res.end(data);			
		})();
		
	} else if (url === '/fire') {
		res.statusCode = 200;
		res.setHeader('Content-Type', 'application/json');
		
		let respObj = {fire: true};
		
		if (args) {
			let fireArgs = args;
			
			if (!fireArgs.hasOwnProperty('wid') && !fireArgs.hasOwnProperty('group')) {
				respObj.fire = false;
				res.end(JSON.stringify(respObj));
				console.log('wid and group args not provided.');
				return;
			}
			
			fireArgs.wid = decodeURIComponent(fireArgs.wid);
			fireArgs.group = decodeURIComponent(fireArgs.group);
			
			(async () => {
				await setFire(fireArgs);
			})();
		}
		
		(async () => {
			await setLive(false);
		})();
				
		res.end(JSON.stringify(respObj));
		
	
	} else if (url === '/trigger') {
		(async () => {
			res.statusCode = 200;
			res.setHeader('Content-Type', 'application/json');
			
			let respObj = {};
			
			await setLive();
			
			let data;
			
			try {
				data = await fsP.readFile("fire.txt", "utf8");
			} catch(err) {
				console.log(`Error reading fire.txt: ${err}`);
			}
			
			try {
				data = JSON.parse(data);
				//console.log(`Trigger data: ${JSON.stringify(data)}`);
			} catch(e) {
				data = null;
			}
			
			if (Array.isArray(data) && data.length) {
				setFire(null,true);
				respObj.fire = true;
				
				let widgetData = await loadAttributes(data[0].group, data[0].wid);
				respObj.txt = widgetData;
				
				console.log(`Sending trigger data: ${JSON.stringify(respObj)}`);
			
			} else {
				respObj.fire = false;
				respObj.txt = null;
			}
			
			res.end(JSON.stringify(respObj));
			
		})();
	} else if (url === '/busy') {
		res.statusCode = 200;
		res.setHeader('Content-Type', 'application/json');
		
		let respObj = {};
		// Set a widget by wid to busy or not busy.
		if (args.hasOwnProperty('set')) {		
			(async () => {
				let setBusy = false;
				let busyObj = [];
				let curBusy = [];
				let wid;
				let type = null;
				
				if (args.hasOwnProperty('wid')) {
					wid = decodeURIComponent(args.wid);
				}
				if (args.hasOwnProperty('type')) {
					type = decodeURIComponent(args.type);
				}
				
				try {
					curBusy = await fsP.readFile("busy.txt", "utf8");
					//console.log(`Reading busy.txt: ${curBusy}`);
					if (curBusy) {
						curBusy = JSON.parse(curBusy);
						if (Array.isArray(curBusy)) {
							busyObj = curBusy;
						}
					}
				} catch(e) {
					console.log(`Unable to get current busy object: ${e}`);
				}
				
				if (args.set == 'true') {
					// Search for existing wids in busy.txt and set to true.
					// 	  Otherwise push a new busy object.
					var foundBusy = false;
					for (let i = 0; i < busyObj.length; i++) {
						if (busyObj[i].wid == wid) {
							busyObj[i].busy = true;
							foundBusy = true;
						} else if (type && busyObj[i].type == type) {
							busyObj[i].busy = false;
						}
					}
					
					if (!foundBusy) {
						busyObj.push({busy: true, wid: wid, type: type});
					}
					
					busyObj = JSON.stringify(busyObj);
					
					try {
						await fsP.writeFile("busy.txt", busyObj);
					} catch(e) {
						console.log('error writing true -> busy.txt');
					}
				
					console.log(`Setting busy to true. ${busyObj}`);
						
					res.end(busyObj);
						
				} else {
					console.log(`Setting busy for ${wid} to false. ${JSON.stringify(curBusy)}`);
					// If there are no existing busy widgets then set busy.txt to false.
					// Otherwise, look through list of active widgets and set matching
					//		widget busy to false.
					// Or if a wid is not provided, clear all busy to false.
					if (!curBusy.length || !wid) {
						busyObj = [{busy: false}];
						busyObj = JSON.stringify(busyObj);
						try {
							await fsP.writeFile("busy.txt", busyObj);
						} catch(e) {
							
						}
						console.log(`Setting busy to false. ${busyObj}`);
						res.end(busyObj);
					} else {
						
						for (let i = 0; i < curBusy.length; i++) {
							if (curBusy[i].wid == wid) {
								curBusy[i].busy = false;
							}
						}
						
						curBusy = JSON.stringify(curBusy);
						try {
							await fsP.writeFile("busy.txt", curBusy);
						} catch(e) {
							
						}
						res.end(curBusy);
					}
				}
			})();
				
		} else {
			
			(async () => {
				let data;
				
				try {
					data = await fsP.readFile("busy.txt", "utf8");	
				} catch(err) {
					console.log(`Error reading busy.txt: ${err}`);
				}
				data = JSON.parse(data);
								
				respObj = data;
				respObj.live = await isLive();
				respObj = JSON.stringify(respObj);
				
				//console.log(`Reading busy obj. ${respObj}`);
								
				res.end(respObj);
			})();
			
		}
	} else if (url === '/images') {
		let filename;
		
		if (!args.hasOwnProperty('name')) {
			res.statusCode = 200;
			res.end('error');
			return;
		}
		
		fs.readFile(`${__dirname}/images/${args.name}.png`, (err, data) => {
			
			if (err) {
				console.log(err);
				res.end('error');
				return;
			}
			res.statusCode = 200;
			res.setHeader('Content-Type', 'image/png');
			res.end(data);			
		});
		
	} else if (url === '/sounds') {
		let filename;
		
		if (!args.hasOwnProperty('name')) {
			res.statusCode = 200;
			res.end('error');
			return;
		}
		
		fs.readFile(`${__dirname}/sounds/${args.name}.ogg`, (err, data) => {
			
			if (err) {
				console.log(err);
				res.end('error');
				return;
			}
			res.statusCode = 200;
			res.setHeader('Content-Type', 'audio/ogg');
			res.end(data);			
		});
	} else if (url == '/fonts') {
		//Staatliches-Regular.ttf
		let fontName = 'Staatliches-Regular.ttf'
		if (args.hasOwnProperty('name')) {
			fontName = args.name;			
		}
		
		console.log(`Returning font ${fontName}`);
		
		fs.readFile(`${__dirname}/fonts/${fontName}`, (err, data) => {
		
			if (err) {
				console.log(err);
				res.end('error');
				return;
			}
			res.statusCode = 200;
			res.setHeader('Content-Type', 'font/ttf');
			res.end(data);			
		});

	} else if (url == '/widget/attributes') {
		(async () => {
			res.statusCode = 200;
			res.setHeader('Content-Type', 'application/json');
			
			let dashGroup = 'default';
			
			if (args.hasOwnProperty('group')) {
				dashGroup = args.group;
			}
			
			if (args.hasOwnProperty('save')) {
				let saveArgs = args.save;
				saveArgs = decodeURIComponent(saveArgs);
				
				console.log(`Decoded save args: ${saveArgs}`);
				
				try {
					saveArgs = JSON.parse(saveArgs);
					console.log(`Parsed save args: ${saveArgs}`);
				} catch(e) {
					res.end(`{"error": "Error parsing attributes."}`);
					console.log(`Error parsing attributes: ${e}`);
					return false;
				}
				
				console.log(saveArgs);
				
				let saved = await saveAttributes(dashGroup, saveArgs);
			
				res.end(`{"message": "Attributes saved for ${dashGroup}: ${saved}.","success": ${saved}}`);
			
			} else if (args.hasOwnProperty('load')) {
				let dashGroup = 'default';
			
				if (args.hasOwnProperty('group')) {
					dashGroup = args.group;
				}
				
				let loaded = await loadAttributes(dashGroup);
				loaded = JSON.stringify(loaded);
				loaded = encodeURIComponent(loaded);
				
				res.end(`{"message": "Attributes loaded for ${dashGroup}.","data": "${loaded}"}`);
			} else if (args.hasOwnProperty('remove')) {
				let wid;
				
				if (args.hasOwnProperty('group')) {
					dashGroup = args.group;
				}
				wid = args.remove;
				
				let removed = await removeAttribute(dashGroup, wid);
				
				
				res.end(`{"message": "Removing button ${wid} from ${dashGroup}.", "success": ${removed}}`);
				
			} else {
				res.end('{"message": "Nothing to see here"}');
			}
		})();
		
	} else if (url === '/mathparse') {
		
		res.statusCode = 200;
		res.setHeader('Content-Type', 'application/json');
		
		if (!args.hasOwnProperty('exp') || !args.exp) {
			res.end(`Please provide expression.`);
			return false;
		}
		
		let exp = decodeURIComponent(args.exp);
		let returnObj = {expression: exp,result: 0};
		
		console.log(`Parsing math expression: ${exp}`);
		
		exp = parseExpression(exp);
		
		console.log(`Parsing math result: ${exp}`);
		
		returnObj.result = exp;
		
		res.end(JSON.stringify(returnObj));
		
	} else {
		res.statusCode = 200;
		res.setHeader('Content-Type', 'text/plain');
		res.end(`url: ${url}\nargs: ${JSON.stringify(args)}`);
	}
	
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});

async function saveAttributes(attGroup, attObj) {
	var wid = null;
	if (attObj.hasOwnProperty('wid')) {
		wid = attObj.wid;
	} else {
		console.log('No ID found.');
		return false;
	}
	
	let attsObj = [];
	attsObj = await loadAttributes(attGroup);
	
	if (!attsObj) {
		attsObj = [];
		console.log('No attributes loaded.');
	}
	
	if (!attObj) {
		return false;
	}
	
	if (!wid) {
		return false;
	}
	
	console.log(`Saving attribute ${wid} : ${JSON.stringify(attObj)}`);
	
	var found = false;
	if (attsObj.length) {
		for (let i = 0; i < attsObj.length; i++) {
			if (attsObj[i].hasOwnProperty('wid') && attsObj[i].wid == wid) {
				attsObj[i] = attObj;
				console.log(`Found attribute for ${wid}`);
				found = true;
			}
		}
	}
	
	if (!found) {
		attsObj.push(attObj);
	}
		
	try {
		attsObj = JSON.stringify(attsObj);
		await fsP.writeFile(`attributes.${attGroup}.txt`, attsObj);
	} catch(e) {
		console.log(`Error saving attributes.${attGroup}.txt`);
		return false;
	}

	return true;
}

async function removeAttribute(attGroup, wid) {
	
	let attsObj = [];
	attsObj = await loadAttributes(attGroup);
	
	if (!attsObj) {
		attsObj = [];
		console.log('No attributes loaded.');
		return false;
	}
		
	if (!wid) {
		return false;
	}
	
	console.log(`Removing attribute ${wid} from  ${JSON.stringify(attsObj)}`);
	
	if (attsObj.length) {
		for (let i = 0; i < attsObj.length; i++) {
			if (attsObj[i].hasOwnProperty('wid') && attsObj[i].wid == wid) {
				attsObj.splice(i,1);
				console.log(`Removed attribute for ${wid}`);
				break;
			}
		}
	}
			
	try {
		attsObj = JSON.stringify(attsObj);
		await fsP.writeFile(`attributes.${attGroup}.txt`, attsObj);
	} catch(e) {
		console.log(`Error saving attributes.${attGroup}.txt`);
		return false;
	}

	return true;
}

async function loadAttributes(attGroup = 'default', wid = null) {
	let attsObj;
	let returnAttsObj = null;
	
	try {
		attsObj = await fsP.readFile(`attributes.${attGroup}.txt`, "utf8");
	} catch (e) {
		console.log(`Error loading attributes.${attGroup}.txt`);
		return null;
	}
	
	if (attsObj) {
		attsObj = JSON.parse(attsObj);
	} else {
		return null;
	}
	
	if (!wid) {
		console.log(`All attributes loaded: ${JSON.stringify(attsObj)}`);
		return attsObj;
	}
	
	if (attsObj.length) {
		for (let i = 0; i < attsObj.length; i++) {
			if (attsObj[i].hasOwnProperty('wid') && attsObj[i].wid == wid) {
				returnAttsObj = attsObj[i];
			}
		}
	}
	
	console.log(`Attributes loaded: ${JSON.stringify(returnAttsObj)}`);
	return returnAttsObj;
}

async function saveDashboard(dashboardName, dashboardRoute) {
	let dashboards = [];
	dashboards = await loadDashboards(dashboardRoute);
	
	if (!dashboards) {
		dashboards = [];
		console.log('No dashboards loaded.');
	}
	
	if (!dashboardName) {
		return false;
	}
	
	if (!dashboardRoute) {
		return false;
	}
	
	let newDash = {name: dashboardName, route: dashboardRoute};
	console.log(`Saving dashboard ${dashboardName}`);
	
	var found = false;
	if (dashboards.length) {
		for (let i = 0; i < dashboards.length; i++) {
			if (dashboards[i].hasOwnProperty('route') && dashboards[i].route == dashboardRoute) {
				console.log(`Dashboard for ${dashboardName} found.`);
				
				// Update name if name is different.
				if (dashboards[i].name != dashboardName) {
					console.log(`Update name of dashboard from ${dashboards[i].name} to ${dashboardName}`);
					dashboards[i].name = dashboardName;
				}
				
				found = true;
			}
		}
	}
	
	if (!found) {
		dashboards.push(newDash);
	}
		
	try {
		dashboards = JSON.stringify(dashboards);
		await fsP.writeFile(`dashboards.txt`, dashboards);
	} catch(e) {
		console.log(`Error saving dashboards.txt`);
		return false;
	}

	return true;
}

async function loadDashboards() {
	let dashboards;
	let returnAttsObj = null;
	
	try {
		dashboards = await fsP.readFile(`dashboards.txt`, "utf8");
	} catch (e) {
		console.log(`Error loading dashboards.txt`);
		return null;
	}
	
	if (dashboards) {
		dashboards = JSON.parse(dashboards);
	} else {
		return null;
	}
	
	console.log(`Dashboards loaded: ${JSON.stringify(dashboards)}`);
	return dashboards;
}

async function setFire(data, clear = false) {
	let fireData = [];
	
	if (!clear) {
		if (!data) {
			console.log('No fire data provided.');
			return;
		}
		
		try {
			let curFire = await fsP.readFile("fire.txt", "utf8");
			if (curFire) {
				curFire = JSON.parse(curFire);
				fireData = curFire;
				console.log(`Current fire data: ${JSON.stringify(fireData)}`);
			}
		} catch(e) {
			
		}
		
		fireData.push(data);
		
		try {
			await fsP.writeFile("fire.txt", JSON.stringify(fireData))
			console.log(`FIRE!!! ${JSON.stringify(fireData)}`);
		} catch(e) {			
			console.log(`Error writing fire.txt: ${e}`);
		}
		
	} else {
		try {
		await fsP.writeFile("fire.txt", JSON.stringify(fireData))
			console.log("Clear fire.");
		} catch(e) {			
			console.log(`Error writing fire.txt: ${e}`);
		}
	}
}

async function setLive(live = true) {
	try {
		let txt = 'true';
		if (!live) {
			txt = 'false';
			console.log("Clearing live flag.");
		}
		
		await fsP.writeFile("live.txt", txt);
		
	} catch(err) {
		console.log(`Error writing live.txt: ${err}`);
	}
}

async function isLive() {
	try {
		data = await fsP.readFile("live.txt", "utf8");	
	} catch(err) {
		console.log(`Error reading live.txt: ${err}`);
	}
	
	if (data.startsWith('true')) {
		return true;
	}
	
	return false;
}

function parseExpression(exp) {
	// Parse addition and subtraction
	//exp = exp.replace(/\*\-/gm,'&');
	
	exp = expVar(exp);
	
	let sum = expParen(exp);
	
	console.log(`Math (=): ${exp} = ${sum}`);
	
	return sum;
}

function expVar(exp) {
	let regx = RegExp(/{([a-zA-Z0-9_\-\.]+)}/,'gm');
	let regxObj;
	let varName;
	let varValue = "1";
	
	while ((regxObj = regx.exec(exp)) !== null) {
		let start = regxObj.index;
		let end = regx.lastIndex;
		let varName = regxObj[0].substr(1,regxObj[0].length-2);
		
		console.log(`Math: found var: ${varName}`);
		
		exp = exp.substr(0,start) + varValue + exp.substr(end);		
	}
	
	return exp;
}

function expParen(exp) {
	let regx = RegExp(/(\([0-9\+\-*\.\&\|/]+\))/,'gm');
	let sum = 0;
	let regxObj;
	
	// Replace '*-' as '&' for multiplying negative numbers
	exp = exp.replace(/\*\-/gm,'&');
	// Replace '/-' as '|' for dividing negative numbers
	exp = exp.replace(/\/\-/gm,'|');
	
	console.log(`Math: parsing parens for ${exp}`);
	
	if (exp.indexOf('(') > -1) {
		while ((regxObj = regx.exec(exp)) !== null) {
			let start = regxObj.index;
			let end = regx.lastIndex;
			let parenExp = regxObj[0].substr(1,regxObj[0].length-2);
			
			console.log(`Math: found paren: ${parenExp}`);
			sum = expAdd(parenExp);
			
			exp = exp.substr(0,start) + sum + exp.substr(end);
			
		}
		
		sum = expParen(exp);
		
	} else {
		console.log(`Math: no paren found in: ${exp}`);
		sum = expAdd(exp);
	}
	
	console.log(`Math (paren func exit): ${exp}`);
	return sum;
}

function expAdd(exp) {
	let expSpl;
	
	expSpl = exp.split('+');
	
	console.log(`Math: Addition processing for ${JSON.stringify(expSpl)}`);
	
	let addSum = 0;
	expSpl.forEach(item => {
		//let sum = expMul(item);
		let sum = expSub(item);
		addSum += parseFloat(sum);		
	});
	
	console.log(`Math: Addition complete for ${JSON.stringify(expSpl)} = ${addSum}`);
	
	return addSum;
}

function expSub(exp) {
	let expSpl;
	let sum = exp;
	
	expSpl = exp.split('-');
	
	console.log(`Math: Subtraction processing for ${JSON.stringify(expSpl)}`);
	
	for (let i = 0; i < expSpl.length; i++) {
		if (expSpl[i] == '') {
			expSpl[i] = '0';
		}
		
		let sum = expMul(expSpl[i]);
		sum = parseFloat(sum);
		
		if (i == 0) {
			subSum = sum;
		} else {
			subSum -= sum;
		}
	}
	
	console.log(`Math: Subtraction complete for ${JSON.stringify(expSpl)} = ${subSum}`);
	
	return subSum;
}

function expMul(exp) {
	let expSpl;
	let mult = 1;
	
	if (!exp) {
		return 0;
	}
	
	expSpl = exp.split('*');
	
	console.log(`Math: Multiplication processing for ${JSON.stringify(expSpl)}`);
	
	expSpl.forEach(item => {
		item = expNegMul(item);
		mult = mult * parseFloat(item);
	});
	
	console.log(`Math: Multiplication complete for ${JSON.stringify(expSpl)} = ${mult}`);
	
	return mult;
		
}

function expNegMul(exp) {
	let expSpl;
	let mult = -1;
	
	if (!exp) {
		return 1;
	}
	
	expSpl = exp.split('&');
	
	console.log(`Math: Multiplication with negative numbers processing for ${JSON.stringify(expSpl)}`);
	
	for (let i = 0; i < expSpl.length; i++) {
		let number = expDiv(expSpl[i]);
		number = parseFloat(number);
		
		if (i == 0) {
			mult = number;
		} else {
			mult = mult * (-1 * number);
		}
	}
	console.log(`Math: Multiplication with negative numbers complete for ${JSON.stringify(expSpl)} = ${mult}`);
	
	return mult;	
}

function expDiv(exp) {
	let expSpl;
	let div;
		
	expSpl = exp.split('/');
	
	console.log(`Math: Division processing for ${JSON.stringify(expSpl)}`);
	
	for (let i = 0; i < expSpl.length; i++) {
		let number = expNegDiv(expSpl[i]);
		number = parseFloat(number);
		
		if (i == 0) {
			div = number;
		} else {
			div = div / number;
		}
	}
	
	console.log(`Math: Division complete for ${JSON.stringify(expSpl)} = ${div}`);
	
	return div;
		
}

function expNegDiv(exp) {
	let expSpl;
	let div;
		
	expSpl = exp.split('|');
	
	console.log(`Math: Division with negative numbers processing for ${JSON.stringify(expSpl)}`);
	
	for (let i = 0; i < expSpl.length; i++) {
		let number = expSpl[i]
		number = parseFloat(number);
		
		if (i == 0) {
			// Initial value
			div = number;
		} else {
			div = div / (-1 * number);
		}
	}
	console.log(`Math: Division with negative numbers complete for ${JSON.stringify(expSpl)} = ${div}`);
	
	return div;	
}
