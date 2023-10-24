import FS from 'fs';
import ChildProcess from 'child_process';
import HTTP from 'http';
import HTTPS from 'https';
import XMLHttpRequestEventTarget from './XMLHttpRequestEventTarget.js';
import XMLHttpRequestReadyStateEnum from './XMLHttpRequestReadyStateEnum.js';
import Event from '../event/Event.js';
import IDocument from '../nodes/document/IDocument.js';
import Blob from '../file/Blob.js';
import XMLHttpRequestUpload from './XMLHttpRequestUpload.js';
import DOMException from '../exception/DOMException.js';
import DOMExceptionNameEnum from '../exception/DOMExceptionNameEnum.js';
import { UrlObject } from 'url';
import URL from '../url/URL.js';
import XMLHttpRequestURLUtility from './utilities/XMLHttpRequestURLUtility.js';
import ProgressEvent from '../event/events/ProgressEvent.js';
import XMLHttpResponseTypeEnum from './XMLHttpResponseTypeEnum.js';
import XMLHttpRequestCertificate from './XMLHttpRequestCertificate.js';
import XMLHttpRequestSyncRequestScriptBuilder from './utilities/XMLHttpRequestSyncRequestScriptBuilder.js';
import IconvLite from 'iconv-lite';
import ErrorEvent from '../event/events/ErrorEvent.js';
import Document from '../nodes/document/Document.js';
import AsyncTaskManager from '../async-task-manager/AsyncTaskManager.js';
import WindowBrowserSettingsReader from '../window/WindowBrowserSettingsReader.js';

// These headers are not user setable.
// The following are allowed but banned in the spec:
// * User-agent
const FORBIDDEN_REQUEST_HEADERS = [
	'accept-charset',
	'accept-encoding',
	'access-control-request-headers',
	'access-control-request-method',
	'connection',
	'content-length',
	'content-transfer-encoding',
	'cookie',
	'cookie2',
	'date',
	'expect',
	'host',
	'keep-alive',
	'origin',
	'referer',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
	'via'
];

// These request methods are not allowed
const FORBIDDEN_REQUEST_METHODS = ['TRACE', 'TRACK', 'CONNECT'];
// Match Content-Type header charset
const CONTENT_TYPE_ENCODING_REGEXP = /charset=([^;]*)/i;

/**
 * XMLHttpRequest.
 *
 * Based on:
 * https://github.com/mjwwit/node-XMLHttpRequest/blob/master/lib/XMLHttpRequest.js
 */
export default class XMLHttpRequest extends XMLHttpRequestEventTarget {
	// Constants
	public static UNSENT = XMLHttpRequestReadyStateEnum.unsent;
	public static OPENED = XMLHttpRequestReadyStateEnum.opened;
	public static HEADERS_RECEIVED = XMLHttpRequestReadyStateEnum.headersRecieved;
	public static LOADING = XMLHttpRequestReadyStateEnum.loading;
	public static DONE = XMLHttpRequestReadyStateEnum.done;

	// Public properties
	public upload: XMLHttpRequestUpload = new XMLHttpRequestUpload();

	// Will be injected by a sub-class in Window.
	protected readonly _asyncTaskManager: AsyncTaskManager;
	protected readonly _ownerDocument: IDocument;

	// Private properties
	readonly #internal: {
		state: {
			incommingMessage:
				| HTTP.IncomingMessage
				| { headers: { [name: string]: string | string[] }; statusCode: number };
			response: ArrayBuffer | Blob | IDocument | object | string;
			responseType: XMLHttpResponseTypeEnum | '';
			responseText: string;
			responseXML: IDocument;
			responseURL: string;
			readyState: XMLHttpRequestReadyStateEnum;
			asyncRequest: HTTP.ClientRequest;
			asyncTaskID: number;
			requestHeaders: object;
			status: number;
			statusText: string;
			send: boolean;
			error: boolean;
			aborted: boolean;
		};
		settings: {
			method: string;
			url: string;
			async: boolean;
			user: string;
			password: string;
		};
	} = {
		state: {
			incommingMessage: null,
			response: null,
			responseType: '',
			responseText: '',
			responseXML: null,
			responseURL: '',
			readyState: XMLHttpRequestReadyStateEnum.unsent,
			asyncRequest: null,
			asyncTaskID: null,
			requestHeaders: {},
			status: null,
			statusText: null,
			send: false,
			error: false,
			aborted: false
		},
		settings: {
			method: null,
			url: null,
			async: true,
			user: null,
			password: null
		}
	};

	/**
	 * Returns the status.
	 *
	 * @returns Status.
	 */
	public get status(): number {
		return this.#internal.state.status;
	}

	/**
	 * Returns the status text.
	 *
	 * @returns Status text.
	 */
	public get statusText(): string {
		return this.#internal.state.statusText;
	}

	/**
	 * Returns the response.
	 *
	 * @returns Response.
	 */
	public get response(): ArrayBuffer | Blob | IDocument | object | string {
		return this.#internal.state.response;
	}

	/**
	 * Returns the response URL.
	 *
	 * @returns Response URL.
	 */
	public get responseURL(): string {
		return this.#internal.state.responseURL;
	}

	/**
	 * Returns the ready state.
	 *
	 * @returns Ready state.
	 */
	public get readyState(): XMLHttpRequestReadyStateEnum {
		return this.#internal.state.readyState;
	}

	/**
	 * Get the response text.
	 *
	 * @throws {DOMException} If the response type is not text or empty.
	 * @returns The response text.
	 */
	public get responseText(): string {
		if (this.responseType === XMLHttpResponseTypeEnum.text || this.responseType === '') {
			return this.#internal.state.responseText;
		}
		throw new DOMException(
			`Failed to read the 'responseText' property from 'XMLHttpRequest': The value is only accessible if the object's 'responseType' is '' or 'text' (was '${this.responseType}').`,
			DOMExceptionNameEnum.invalidStateError
		);
	}

	/**
	 * Get the responseXML.
	 *
	 * @throws {DOMException} If the response type is not text or empty.
	 * @returns Response XML.
	 */
	public get responseXML(): IDocument {
		if (this.responseType === XMLHttpResponseTypeEnum.document || this.responseType === '') {
			return this.#internal.state.responseXML;
		}
		throw new DOMException(
			`Failed to read the 'responseXML' property from 'XMLHttpRequest': The value is only accessible if the object's 'responseType' is '' or 'document' (was '${this.responseType}').`,
			DOMExceptionNameEnum.invalidStateError
		);
	}

	/**
	 * Set response type.
	 *
	 * @param type Response type.
	 * @throws {DOMException} If the state is not unsent or opened.
	 * @throws {DOMException} If the request is synchronous.
	 */
	public set responseType(type: XMLHttpResponseTypeEnum | '') {
		// ResponseType can only be set when the state is unsent or opened.
		if (
			this.readyState !== XMLHttpRequestReadyStateEnum.opened &&
			this.readyState !== XMLHttpRequestReadyStateEnum.unsent
		) {
			throw new DOMException(
				`Failed to set the 'responseType' property on 'XMLHttpRequest': The object's state must be OPENED or UNSENT.`,
				DOMExceptionNameEnum.invalidStateError
			);
		}
		// Sync requests can only have empty string or 'text' as response type.
		if (!this.#internal.settings.async) {
			throw new DOMException(
				`Failed to set the 'responseType' property on 'XMLHttpRequest': The response type cannot be changed for synchronous requests made from a document.`,
				DOMExceptionNameEnum.invalidStateError
			);
		}
		this.#internal.state.responseType = type;
	}

	/**
	 * Get response Type.
	 *
	 * @returns Response type.
	 */
	public get responseType(): XMLHttpResponseTypeEnum | '' {
		return this.#internal.state.responseType;
	}

	/**
	 * Opens the connection.
	 *
	 * @param method Connection method (eg GET, POST).
	 * @param url URL for the connection.
	 * @param [async=true] Asynchronous connection.
	 * @param [user] Username for basic authentication (optional).
	 * @param [password] Password for basic authentication (optional).
	 */
	public open(method: string, url: string, async = true, user?: string, password?: string): void {
		this.abort();

		this.#internal.state.aborted = false;
		this.#internal.state.error = false;

		const upperMethod = method.toUpperCase();

		// Check for valid request method
		if (FORBIDDEN_REQUEST_METHODS.includes(upperMethod)) {
			throw new DOMException('Request method not allowed', DOMExceptionNameEnum.securityError);
		}

		// Check responseType.
		if (!async && !!this.responseType && this.responseType !== XMLHttpResponseTypeEnum.text) {
			throw new DOMException(
				`Failed to execute 'open' on 'XMLHttpRequest': Synchronous requests from a document must not set a response type.`,
				DOMExceptionNameEnum.invalidAccessError
			);
		}

		this.#internal.settings = {
			method: upperMethod,
			url: url,
			async: async,
			user: user || null,
			password: password || null
		};

		this._setState(XMLHttpRequestReadyStateEnum.opened);
	}

	/**
	 * Sets a header for the request.
	 *
	 * @param header Header name
	 * @param value Header value
	 * @returns Header added.
	 */
	public setRequestHeader(header: string, value: string): boolean {
		if (this.readyState !== XMLHttpRequestReadyStateEnum.opened) {
			throw new DOMException(
				`Failed to execute 'setRequestHeader' on 'XMLHttpRequest': The object's state must be OPENED.`,
				DOMExceptionNameEnum.invalidStateError
			);
		}

		const lowerHeader = header.toLowerCase();

		if (FORBIDDEN_REQUEST_HEADERS.includes(lowerHeader)) {
			return false;
		}

		if (this.#internal.state.send) {
			throw new DOMException(
				`Failed to execute 'setRequestHeader' on 'XMLHttpRequest': Request is in progress.`,
				DOMExceptionNameEnum.invalidStateError
			);
		}

		this.#internal.state.requestHeaders[lowerHeader] = value;

		return true;
	}

	/**
	 * Gets a header from the server response.
	 *
	 * @param header header Name of header to get.
	 * @returns string Text of the header or null if it doesn't exist.
	 */
	public getResponseHeader(header: string): string {
		const lowerHeader = header.toLowerCase();

		// Cookie headers are excluded for security reasons as per spec.
		if (
			typeof header === 'string' &&
			header !== 'set-cookie' &&
			header !== 'set-cookie2' &&
			this.readyState > XMLHttpRequestReadyStateEnum.opened &&
			this.#internal.state.incommingMessage.headers[lowerHeader] &&
			!this.#internal.state.error
		) {
			return Array.isArray(this.#internal.state.incommingMessage.headers[lowerHeader])
				? (<string[]>this.#internal.state.incommingMessage.headers[lowerHeader]).join(', ')
				: <string>this.#internal.state.incommingMessage.headers[lowerHeader];
		}

		return null;
	}

	/**
	 * Gets all the response headers.
	 *
	 * @returns A string with all response headers separated by CR+LF.
	 */
	public getAllResponseHeaders(): string {
		if (
			this.readyState < XMLHttpRequestReadyStateEnum.headersRecieved ||
			this.#internal.state.error
		) {
			return '';
		}

		const result = [];

		for (const name of Object.keys(this.#internal.state.incommingMessage.headers)) {
			// Cookie headers are excluded for security reasons as per spec.
			if (name !== 'set-cookie' && name !== 'set-cookie2') {
				result.push(`${name}: ${this.#internal.state.incommingMessage.headers[name]}`);
			}
		}

		return result.join('\r\n');
	}

	/**
	 * Sends the request to the server.
	 *
	 * @param data Optional data to send as request body.
	 */
	public send(data?: string): void {
		if (this.readyState != XMLHttpRequestReadyStateEnum.opened) {
			throw new DOMException(
				`Failed to execute 'send' on 'XMLHttpRequest': Connection must be opened before send() is called.`,
				DOMExceptionNameEnum.invalidStateError
			);
		}

		if (this.#internal.state.send) {
			throw new DOMException(
				`Failed to execute 'send' on 'XMLHttpRequest': Send has already been called.`,
				DOMExceptionNameEnum.invalidStateError
			);
		}

		const { location } = this._ownerDocument._defaultView;

		const url = new URL(this.#internal.settings.url, location);

		// Security check.
		if (url.protocol === 'http:' && location.protocol === 'https:') {
			throw new DOMException(
				`Mixed Content: The page at '${location.href}' was loaded over HTTPS, but requested an insecure XMLHttpRequest endpoint '${url.href}'. This request has been blocked; the content must be served over HTTPS.`,
				DOMExceptionNameEnum.securityError
			);
		}

		// Load files off the local filesystem (file://)
		if (XMLHttpRequestURLUtility.isLocal(url)) {
			if (
				!WindowBrowserSettingsReader.getSettings(this._ownerDocument._defaultView)
					.enableFileSystemHttpRequests
			) {
				throw new DOMException(
					'File system is disabled by default for security reasons. To enable it, set the Happy DOM setting "enableFileSystemHttpRequests" option to true.',
					DOMExceptionNameEnum.securityError
				);
			}

			if (this.#internal.settings.method !== 'GET') {
				throw new DOMException(
					'Failed to send local file system request. Only "GET" method is supported for local file system requests.',
					DOMExceptionNameEnum.notSupportedError
				);
			}

			if (this.#internal.settings.async) {
				this._sendLocalAsyncRequest(url).catch((error) => this._onError(error));
			} else {
				this._sendLocalSyncRequest(url);
			}
			return;
		}

		// TODO: CORS check.

		const host = XMLHttpRequestURLUtility.getHost(url);
		const ssl = XMLHttpRequestURLUtility.isSSL(url);

		// Default to port 80. If accessing localhost on another port be sure
		// To use http://localhost:port/path
		const port = Number(url.port) || (ssl ? 443 : 80);
		// Add query string if one is used
		const uri = url.pathname + (url.search ? url.search : '');

		// Set the Host header or the server may reject the request
		this.#internal.state.requestHeaders['host'] = host;
		if (!((ssl && port === 443) || port === 80)) {
			this.#internal.state.requestHeaders['host'] += ':' + url.port;
		}

		// Set Basic Auth if necessary
		if (this.#internal.settings.user) {
			this.#internal.settings.password ??= '';
			const authBuffer = Buffer.from(
				this.#internal.settings.user + ':' + this.#internal.settings.password
			);
			this.#internal.state.requestHeaders['authorization'] =
				'Basic ' + authBuffer.toString('base64');
		}
		// Set the Content-Length header if method is POST
		switch (this.#internal.settings.method) {
			case 'GET':
			case 'HEAD':
				data = null;
				break;
			case 'POST':
				this.#internal.state.requestHeaders['content-type'] ??= 'text/plain;charset=UTF-8';
				if (data) {
					this.#internal.state.requestHeaders['content-length'] = Buffer.isBuffer(data)
						? data.length
						: Buffer.byteLength(data);
				} else {
					this.#internal.state.requestHeaders['content-length'] = 0;
				}
				break;

			default:
				break;
		}

		const options: HTTPS.RequestOptions = {
			host: host,
			port: port,
			path: uri,
			method: this.#internal.settings.method,
			headers: { ...this._getDefaultRequestHeaders(), ...this.#internal.state.requestHeaders },
			agent: false,
			rejectUnauthorized: true
		};

		if (ssl) {
			options.key = XMLHttpRequestCertificate.key;
			options.cert = XMLHttpRequestCertificate.cert;
		}

		// Reset error flag
		this.#internal.state.error = false;

		// Handle async requests
		if (this.#internal.settings.async) {
			this._sendAsyncRequest(options, ssl, data).catch((error) => this._onError(error));
		} else {
			this._sendSyncRequest(options, ssl, data);
		}
	}

	/**
	 * Aborts a request.
	 */
	public abort(): void {
		if (this.#internal.state.asyncRequest) {
			this.#internal.state.asyncRequest.destroy();
			this.#internal.state.asyncRequest = null;
		}

		this.#internal.state.status = null;
		this.#internal.state.statusText = null;
		this.#internal.state.requestHeaders = {};
		this.#internal.state.responseText = '';
		this.#internal.state.responseXML = null;
		this.#internal.state.aborted = true;
		this.#internal.state.error = true;

		if (
			this.readyState !== XMLHttpRequestReadyStateEnum.unsent &&
			(this.readyState !== XMLHttpRequestReadyStateEnum.opened || this.#internal.state.send) &&
			this.readyState !== XMLHttpRequestReadyStateEnum.done
		) {
			this.#internal.state.send = false;
			this._setState(XMLHttpRequestReadyStateEnum.done);
		}
		this.#internal.state.readyState = XMLHttpRequestReadyStateEnum.unsent;

		if (this.#internal.state.asyncTaskID !== null) {
			this._asyncTaskManager.endTask(this.#internal.state.asyncTaskID);
		}
	}

	/**
	 * Changes readyState and calls onreadystatechange.
	 *
	 * @param state
	 */
	private _setState(state: XMLHttpRequestReadyStateEnum): void {
		if (
			this.readyState === state ||
			(this.readyState === XMLHttpRequestReadyStateEnum.unsent && this.#internal.state.aborted)
		) {
			return;
		}

		this.#internal.state.readyState = state;

		if (
			this.#internal.settings.async ||
			this.readyState < XMLHttpRequestReadyStateEnum.opened ||
			this.readyState === XMLHttpRequestReadyStateEnum.done
		) {
			this.dispatchEvent(new Event('readystatechange'));
		}

		if (this.readyState === XMLHttpRequestReadyStateEnum.done) {
			let fire: Event;

			if (this.#internal.state.aborted) {
				fire = new Event('abort');
			} else if (this.#internal.state.error) {
				fire = new Event('error');
			} else {
				fire = new Event('load');
			}

			this.dispatchEvent(fire);
			this.dispatchEvent(new Event('loadend'));
		}
	}

	/**
	 * Default request headers.
	 *
	 * @returns Default request headers.
	 */
	private _getDefaultRequestHeaders(): { [key: string]: string } {
		const { location, navigator, document } = this._ownerDocument._defaultView;

		return {
			accept: '*/*',
			referer: location.href,
			'user-agent': navigator.userAgent,
			cookie: (<Document>document)._cookie.getCookieString(location, false)
		};
	}

	/**
	 * Sends a synchronous request.
	 *
	 * @param options
	 * @param ssl
	 * @param data
	 */
	private _sendSyncRequest(options: HTTPS.RequestOptions, ssl: boolean, data?: string): void {
		const scriptString = XMLHttpRequestSyncRequestScriptBuilder.getScript(options, ssl, data);

		// Start the other Node Process, executing this string
		const content = ChildProcess.execFileSync(process.argv[0], ['-e', scriptString], {
			encoding: 'buffer',
			maxBuffer: 1024 * 1024 * 1024 // TODO: Consistent buffer size: 1GB.
		});

		// If content length is 0, then there was an error
		if (!content.length) {
			throw new DOMException('Synchronous request failed', DOMExceptionNameEnum.networkError);
		}

		const { error, data: response } = JSON.parse(content.toString());

		if (error) {
			this._onError(error);
			return;
		}

		if (response) {
			this.#internal.state.incommingMessage = {
				statusCode: response.statusCode,
				headers: response.headers
			};
			this.#internal.state.status = response.statusCode;
			this.#internal.state.statusText = response.statusMessage;
			// Although it will immediately be set to loading,
			// According to the spec, the state should be headersRecieved first.
			this._setState(XMLHttpRequestReadyStateEnum.headersRecieved);
			this._setState(XMLHttpRequestReadyStateEnum.loading);
			this.#internal.state.response = this._decodeResponseText(
				Buffer.from(response.data, 'base64')
			);
			this.#internal.state.responseText = this.#internal.state.response;
			this.#internal.state.responseXML = null;
			this.#internal.state.responseURL = new URL(
				this.#internal.settings.url,
				this._ownerDocument._defaultView.location
			).href;
			// Set Cookies.
			this._setCookies(this.#internal.state.incommingMessage.headers);
			// Redirect.
			if (
				this.#internal.state.incommingMessage.statusCode === 301 ||
				this.#internal.state.incommingMessage.statusCode === 302 ||
				this.#internal.state.incommingMessage.statusCode === 303 ||
				this.#internal.state.incommingMessage.statusCode === 307
			) {
				const redirectUrl = new URL(
					<string>this.#internal.state.incommingMessage.headers['location'],
					this._ownerDocument._defaultView.location
				);
				ssl = redirectUrl.protocol === 'https:';
				this.#internal.settings.url = redirectUrl.href;
				// Recursive call.
				this._sendSyncRequest(
					Object.assign(options, {
						host: redirectUrl.host,
						path: redirectUrl.pathname + (redirectUrl.search ?? ''),
						port: redirectUrl.port || (ssl ? 443 : 80),
						method:
							this.#internal.state.incommingMessage.statusCode === 303
								? 'GET'
								: this.#internal.settings.method,
						headers: Object.assign(options.headers, {
							referer: redirectUrl.origin,
							host: redirectUrl.host
						})
					}),
					ssl,
					data
				);
			}

			this._setState(XMLHttpRequestReadyStateEnum.done);
		}
	}

	/**
	 * Sends an async request.
	 *
	 * @param options
	 * @param ssl
	 * @param data
	 */
	private _sendAsyncRequest(
		options: HTTPS.RequestOptions,
		ssl: boolean,
		data?: string
	): Promise<void> {
		return new Promise((resolve) => {
			// Starts async task in Happy DOM
			this.#internal.state.asyncTaskID = this._asyncTaskManager.startTask(this.abort.bind(this));

			// Use the proper protocol
			const sendRequest = ssl ? HTTPS.request : HTTP.request;

			// Request is being sent, set send flag
			this.#internal.state.send = true;

			// As per spec, this is called here for historical reasons.
			this.dispatchEvent(new Event('readystatechange'));

			// Create the request
			this.#internal.state.asyncRequest = sendRequest(
				<object>options,
				async (response: HTTP.IncomingMessage) => {
					await this._onAsyncResponse(response, options, ssl, data);

					resolve();

					// Ends async task in Happy DOM
					this._asyncTaskManager.endTask(this.#internal.state.asyncTaskID);
				}
			);
			this.#internal.state.asyncRequest.on('error', (error: Error) => {
				this._onError(error);
				resolve();

				// Ends async task in Happy DOM
				this._asyncTaskManager.endTask(this.#internal.state.asyncTaskID);
			});

			// Node 0.4 and later won't accept empty data. Make sure it's needed.
			if (data) {
				this.#internal.state.asyncRequest.write(data);
			}

			this.#internal.state.asyncRequest.end();

			this.dispatchEvent(new Event('loadstart'));
		});
	}

	/**
	 * Handles an async response.
	 *
	 * @param options Options.
	 * @param ssl SSL.
	 * @param data Data.
	 * @param response Response.
	 * @returns Promise.
	 */
	private _onAsyncResponse(
		response: HTTP.IncomingMessage,
		options: HTTPS.RequestOptions,
		ssl: boolean,
		data?: string
	): Promise<void> {
		return new Promise((resolve) => {
			// Set response var to the response we got back
			// This is so it remains accessable outside this scope
			this.#internal.state.incommingMessage = response;

			// Set Cookies
			this._setCookies(this.#internal.state.incommingMessage.headers);

			// Check for redirect
			// @TODO Prevent looped redirects
			if (
				this.#internal.state.incommingMessage.statusCode === 301 ||
				this.#internal.state.incommingMessage.statusCode === 302 ||
				this.#internal.state.incommingMessage.statusCode === 303 ||
				this.#internal.state.incommingMessage.statusCode === 307
			) {
				// TODO: redirect url protocol change.
				// Change URL to the redirect location
				this.#internal.settings.url = this.#internal.state.incommingMessage.headers.location;
				// Parse the new URL.
				const redirectUrl = new URL(
					this.#internal.settings.url,
					this._ownerDocument._defaultView.location
				);
				this.#internal.settings.url = redirectUrl.href;
				ssl = redirectUrl.protocol === 'https:';
				// Issue the new request
				this._sendAsyncRequest(
					{
						...options,
						host: redirectUrl.hostname,
						port: redirectUrl.port,
						path: redirectUrl.pathname + (redirectUrl.search ?? ''),
						method:
							this.#internal.state.incommingMessage.statusCode === 303
								? 'GET'
								: this.#internal.settings.method,
						headers: { ...options.headers, referer: redirectUrl.origin, host: redirectUrl.host }
					},
					ssl,
					data
				);
				// @TODO Check if an XHR event needs to be fired here
				return;
			}

			this.#internal.state.status = this.#internal.state.incommingMessage.statusCode;
			this.#internal.state.statusText = this.#internal.state.incommingMessage.statusMessage;
			this._setState(XMLHttpRequestReadyStateEnum.headersRecieved);

			// Initialize response.
			let tempResponse = Buffer.from(new Uint8Array(0));

			this.#internal.state.incommingMessage.on('data', (chunk: Uint8Array) => {
				// Make sure there's some data
				if (chunk) {
					tempResponse = Buffer.concat([tempResponse, Buffer.from(chunk)]);
				}
				// Don't emit state changes if the connection has been aborted.
				if (this.#internal.state.send) {
					this._setState(XMLHttpRequestReadyStateEnum.loading);
				}

				const contentLength = Number(
					this.#internal.state.incommingMessage.headers['content-length']
				);
				this.dispatchEvent(
					new ProgressEvent('progress', {
						lengthComputable: !isNaN(contentLength),
						loaded: tempResponse.length,
						total: isNaN(contentLength) ? 0 : contentLength
					})
				);
			});

			this.#internal.state.incommingMessage.on('end', () => {
				if (this.#internal.state.send) {
					// The sendFlag needs to be set before setState is called.  Otherwise, if we are chaining callbacks
					// There can be a timing issue (the callback is called and a new call is made before the flag is reset).
					this.#internal.state.send = false;

					// Set response according to responseType.
					const { response, responseXML, responseText } = this._parseResponseData(tempResponse);
					this.#internal.state.response = response;
					this.#internal.state.responseXML = responseXML;
					this.#internal.state.responseText = responseText;
					this.#internal.state.responseURL = new URL(
						this.#internal.settings.url,
						this._ownerDocument._defaultView.location
					).href;
					// Discard the 'end' event if the connection has been aborted
					this._setState(XMLHttpRequestReadyStateEnum.done);
				}

				resolve();
			});

			this.#internal.state.incommingMessage.on('error', (error) => {
				this._onError(error);
				resolve();
			});
		});
	}

	/**
	 * Sends a local file system async request.
	 *
	 * @param url URL.
	 * @returns Promise.
	 */
	private async _sendLocalAsyncRequest(url: UrlObject): Promise<void> {
		this.#internal.state.asyncTaskID = this._asyncTaskManager.startTask(this.abort.bind(this));

		let data: Buffer;

		try {
			data = await FS.promises.readFile(decodeURI(url.pathname.slice(1)));
		} catch (error) {
			this._onError(error);
			// Release async task.
			this._asyncTaskManager.endTask(this.#internal.state.asyncTaskID);
			return;
		}

		const dataLength = data.length;

		// @TODO: set state headersRecieved first.
		this._setState(XMLHttpRequestReadyStateEnum.loading);
		this.dispatchEvent(
			new ProgressEvent('progress', {
				lengthComputable: true,
				loaded: dataLength,
				total: dataLength
			})
		);

		if (data) {
			this._parseLocalRequestData(url, data);
		}

		this._setState(XMLHttpRequestReadyStateEnum.done);
		this._asyncTaskManager.endTask(this.#internal.state.asyncTaskID);
	}

	/**
	 * Sends a local file system synchronous request.
	 *
	 * @param url URL.
	 */
	private _sendLocalSyncRequest(url: UrlObject): void {
		let data: Buffer;
		try {
			data = FS.readFileSync(decodeURI(url.pathname.slice(1)));
		} catch (error) {
			this._onError(error);
			return;
		}

		// @TODO: set state headersRecieved first.
		this._setState(XMLHttpRequestReadyStateEnum.loading);

		if (data) {
			this._parseLocalRequestData(url, data);
		}

		this._setState(XMLHttpRequestReadyStateEnum.done);
	}

	/**
	 * Parses local request data.
	 *
	 * @param url URL.
	 * @param data Data.
	 */
	private _parseLocalRequestData(url: UrlObject, data: Buffer): void {
		// Manually set the response headers.
		this.#internal.state.incommingMessage = {
			statusCode: 200,
			headers: {
				'content-length': String(data.length),
				'content-type': XMLHttpRequestURLUtility.getMimeTypeFromExt(url)
				// @TODO: 'last-modified':
			}
		};

		this.#internal.state.status = this.#internal.state.incommingMessage.statusCode;
		this.#internal.state.statusText = 'OK';

		const { response, responseXML, responseText } = this._parseResponseData(data);
		this.#internal.state.response = response;
		this.#internal.state.responseXML = responseXML;
		this.#internal.state.responseText = responseText;
		this.#internal.state.responseURL = new URL(
			this.#internal.settings.url,
			this._ownerDocument._defaultView.location
		).href;

		this._setState(XMLHttpRequestReadyStateEnum.done);
	}

	/**
	 * Returns response based to the "responseType" property.
	 *
	 * @param data Data.
	 * @returns Parsed response.
	 */
	private _parseResponseData(data: Buffer): {
		response: ArrayBuffer | Blob | IDocument | object | string;
		responseText: string;
		responseXML: IDocument;
	} {
		switch (this.responseType) {
			case XMLHttpResponseTypeEnum.arraybuffer:
				// See: https://github.com/jsdom/jsdom/blob/c3c421c364510e053478520500bccafd97f5fa39/lib/jsdom/living/helpers/binary-data.js
				const newAB = new ArrayBuffer(data.length);
				const view = new Uint8Array(newAB);
				view.set(data);
				return {
					response: view,
					responseText: null,
					responseXML: null
				};
			case XMLHttpResponseTypeEnum.blob:
				try {
					return {
						response: new this._ownerDocument._defaultView.Blob([new Uint8Array(data)], {
							type: this.getResponseHeader('content-type') || ''
						}),
						responseText: null,
						responseXML: null
					};
				} catch (e) {
					return { response: null, responseText: null, responseXML: null };
				}
			case XMLHttpResponseTypeEnum.document:
				const window = this._ownerDocument._defaultView;
				const domParser = new window.DOMParser();
				let response: IDocument;

				try {
					response = domParser.parseFromString(this._decodeResponseText(data), 'text/xml');
				} catch (e) {
					return { response: null, responseText: null, responseXML: null };
				}

				return { response, responseText: null, responseXML: response };
			case XMLHttpResponseTypeEnum.json:
				try {
					return {
						response: JSON.parse(this._decodeResponseText(data)),
						responseText: null,
						responseXML: null
					};
				} catch (e) {
					return { response: null, responseText: null, responseXML: null };
				}
			case XMLHttpResponseTypeEnum.text:
			case '':
			default:
				const responseText = this._decodeResponseText(data);
				return {
					response: responseText,
					responseText: responseText,
					responseXML: null
				};
		}
	}

	/**
	 * Set Cookies from response headers.
	 *
	 * @param headers Headers.
	 */
	private _setCookies(
		headers: { [name: string]: string | string[] } | HTTP.IncomingHttpHeaders
	): void {
		const originURL = new URL(
			this.#internal.settings.url,
			this._ownerDocument._defaultView.location
		);
		for (const header of ['set-cookie', 'set-cookie2']) {
			if (Array.isArray(headers[header])) {
				for (const cookie of headers[header]) {
					(<Document>this._ownerDocument._defaultView.document)._cookie.addCookieString(
						originURL,
						cookie
					);
				}
			} else if (headers[header]) {
				(<Document>this._ownerDocument._defaultView.document)._cookie.addCookieString(
					originURL,
					<string>headers[header]
				);
			}
		}
	}

	/**
	 * Called when an error is encountered to deal with it.
	 *
	 * @param error Error.
	 */
	private _onError(error: Error | string): void {
		this.#internal.state.status = 0;
		this.#internal.state.statusText = error.toString();
		this.#internal.state.responseText = error instanceof Error ? error.stack : '';
		this.#internal.state.error = true;
		this._setState(XMLHttpRequestReadyStateEnum.done);

		const errorObject = error instanceof Error ? error : new Error(error);
		const event = new ErrorEvent('error', {
			message: errorObject.message,
			error: errorObject
		});

		this._ownerDocument._defaultView.console.error(errorObject);
		this.dispatchEvent(event);
		this._ownerDocument._defaultView.dispatchEvent(event);
	}

	/**
	 * Decodes response text.
	 *
	 * @param data Data.
	 * @returns Decoded text.
	 **/
	private _decodeResponseText(data: Buffer): string {
		const contextTypeEncodingRegexp = new RegExp(CONTENT_TYPE_ENCODING_REGEXP, 'gi');
		// Compatibility with file:// protocol or unpredictable http request.
		const contentType =
			this.getResponseHeader('content-type') ?? this.#internal.state.requestHeaders['content-type'];
		const charset = contextTypeEncodingRegexp.exec(contentType);
		// Default encoding: utf-8.
		return IconvLite.decode(data, charset ? charset[1] : 'utf-8');
	}
}
