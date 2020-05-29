/*
=-=-=-=-=-=-=-=-=-=-=-=-
Album Art Search
=-=-=-=-=-=-=-=-=-=-=-=-
Student ID: 23587271
Comment (Required):

=-=-=-=-=-=-=-=-=-=-=-=-
*/

const http = require('http');
const https = require('https'); // for Spotify API
const fs = require('fs');
const url = require('url');
const querystring = require('querystring');

const credentials = require('./auth/credentials.json');
const authentication_cache = './auth/authentication-res.json';
const images_path = './album-art/';



const port = 3000;
const server = http.createServer();

// Creating objects for token
const base64data = Buffer.from(`${credentials.client_id}:${credentials.client_secret}`).toString('base64');
let post_data = {
	"grant_type" : "client_credentials"
}
let headers = {
	"Content-Type" : "application/x-www-form-urlencoded",
	"Authorization" : `Basic ${base64data}`
}
post_data = querystring.stringify(post_data);
const options = {
	"method": "POST",
	"headers": headers
}

const received_authentication = function(authentication_res, user_input, auth_sent_time, res){
	authentication_res.setEncoding('utf8');
	let body = '';
	authentication_res.on("data", function(chunk) {body += chunk});
	authentication_res.on("end", function(){
		let spotify_auth = JSON.parse(body);
		console.log(spotify_auth);
		// Time expiration +1Hour
		spotify_auth.expiration = new Date(auth_sent_time.getTime() + 3600000);
		create_access_token_cache(spotify_auth);
		create_search_req(spotify_auth, user_input, res);
	});
};

const create_access_token_cache = function (spotify_auth){
	const spotify_authString = JSON.stringify(spotify_auth);
	fs.writeFile('./auth/authentication-res.json', spotify_authString, (err) => {
		if (err) throw err;
		console.log('Finished caching token');
	});
};

const create_search_req = function(spotify_auth, user_input, res){
	const request_endpoint = 'https://api.spotify.com/v1/search?';
	let downloaded_images = 0;
	let albums;

	let query = {
		type:'album',
		q:`${user_input.artist}`,
		access_token: `${spotify_auth.access_token}`
	}
	let qString = querystring.stringify(query);
	let requestURL = `${request_endpoint}${qString}`;
	// console.log(requestURL);
	let test_req = https.get(requestURL, function(search_res){
		console.log('Making request for Album object (image urls)');
		search_res.setEncoding('utf8');
		let body = '';
		search_res.on('data', function(chunk){body += chunk});
		search_res.on('end', function(){
			let search_object = JSON.parse(body);
			// console.log(search_object); // Maybe save this to compare in our cache?
			
			// What will eventually be displayed
			// Change the size of the img for a better display
			let webpage = `
			<!DOCTYPE html>
			<html>
				<head>
					<title>${user_input.artist}</title>
					<style>
						body{
							margin: 0 ;
						}
						h1{
							text-align: center;
						}
						img{
							max-width: 25%;
    						max-height: 25%;
						}

					</style>
				</head>
				<body>
				<h1>${user_input.artist}</h1>
				<div>`;

			albums = search_object.albums.items;
			// console.log(albums);
			// Now we have the albums object (urls) we make image request
			albums.forEach(album => {
				// Checking if we have it
				// Use album.id as Spotify API docs states that album.name might be an empty string (possible duplicates)
				let img_path = `${images_path}${album.id}.jpg`;
				fs.access(img_path, (err) =>{
					if(err) { // It is not cached
						// console.log(`${img_path} is NOT cached`);
						// console.log(album.images[0].url);
						let img_req = https.get(album.images[0].url, function(image_res){
							console.log('Making a request for an image');
							let new_img = fs.createWriteStream(img_path,{'encoding':null});
							image_res.pipe(new_img);
							new_img.on('finish', function(){
								downloaded_images++;
								webpage+=`<img  src=${img_path}  >`;
								// console.log(`downloaded and cached: ${album.id}`);
								if(downloaded_images == albums.length){
									webpage+= '</div></body></html>';
									res.writeHead(200, {'Content-Type':'text/html'});
									res.end(webpage);
								}
							});
						});
						img_req.on('error', function(err) {console.log(err)});
					} else // It is cachced
					{
						// console.log(`${img_path} is cached!`);
						downloaded_images++;
						webpage+=`<img  src=${img_path}  >`;
						if(downloaded_images == albums.length){
							webpage+= '</div></body></html>';
							res.writeHead(200, {'Content-Type':'text/html'});
							res.end(webpage);
						}
					}
				});
			});
		});
	});
	test_req.on('error', function(err) {
		// If there is an error this far into the code, there Spotify may be down?
		console.log(err);
		res.writeHead(404, {'Content-Type':'text/html'});
		res.write(`<h1>Error: No Connection to ${err.hostname}<h3/>`);
		res.end();

	})
}



// Server and routing
server.on("request", connection_handler);
function connection_handler(req, res){
	console.log(`New Request for ${req.url} from ${req.socket.remoteAddress}`);
	// root
	if(req.url === '/'){
		const main = fs.createReadStream('html/main.html');
		res.writeHead(200, {'Content-Type':'text/html'});
		main.pipe(res);// all the info of main.html pipes into the response
		//res.end() // not needed as pipe() does this automatically
	}
	// favicon
	else if(req.url === '/favicon.ico'){
		const favicon = fs.createReadStream('images/favicon.ico');
		res.writeHead(200, {'Content-Type':'image/x-icon'});
		favicon.pipe(res);
	}
	// bannerImage
	else if(req.url === '/images/banner.jpg'){
		const banner = fs.createReadStream('images/banner.jpg');
		res.writeHead(200, {'Content-Type':'image/jpeg'});
		banner.pipe(res);
	}
	// album-art assest
	else if(req.url.startsWith('/album-art/')){
		let image_stream = fs.createReadStream(`.${req.url}`);
		image_stream.on('error', function(err){
			res.writeHead(404, {'Content-Type':'text/plain'});
			res.write('404 Not Found');
			res.end();
		});
		image_stream.on('ready', function(){
			res.writeHead(200, {'Content-Type':'image/jpg'});
			image_stream.pipe(res);
		});
	}
	// search
	else if(req.url.startsWith('/search')){
		const user_input = url.parse(req.url, true).query; // this becomes an object
		// Checks caching then either uses it or request new token
		let cache_valid = false;
		if(fs.existsSync(authentication_cache)){
			cached_auth = require(authentication_cache);
			console.log(cached_auth);
			if(new Date(cached_auth.expiration) > Date.now()){
				cache_valid = true;
			}
			else {
				console.log('Token Expired');
			}
		}
		// Just create search request
		if(cache_valid){
			console.log('Using Cached Token');
			create_search_req(cached_auth, user_input, res);
		}
		else { // Get new token THEN cache it & create search request (both in received_authentication)
			const token_endpoint = 'https://accounts.spotify.com/api/token';
			let auth_sent_time = new Date();
			let authentication_req = https.request(token_endpoint, options, function(authentication_res){
				console.log('Making a request for a new token')
				received_authentication(authentication_res, user_input, auth_sent_time, res);
			});
			authentication_req.on('error', function(e) {
				console.error(e);
			});
			authentication_req.end(post_data);
		}
	}
	// catch-all
	else {
		res.writeHead(404, {'Content-Type':'text/plain'});
			res.write('404 Not Found');
			res.end();
	}
}












server.on("listening", listening_handler);
server.listen(port);
function listening_handler(){
	console.log(`Now Listening on Port ${port}`);
}
