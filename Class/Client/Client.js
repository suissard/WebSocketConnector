import io from "socket.io-client";
import ClientCache from "./ClientCache.js";

/**
 * Systeme de lien websocket et gestion d'un cache de données
 * Déclenche des evenemnt pour pouvoir alimenter un autre gestionnaire d edonéne (ex : store Vue)
 */
export default class WebSocketClient {
	constructor(domain = "localhost", port = 3000, protocole = "http", handlers = {}) {
		this.url = `${protocole}://${domain}:${port}`;
		this.cache = new ClientCache();

		this.nativeListeners = {
			login: this.handleLogin,
			logout: this.handleLogout,
			disconnect: this.handleDisconnect,

			connect_lobby: this.handleConnectLobby,
			disconnect_lobby: this.handleDisconnectLobby,

			send_message: this.handleSendMessage,
			received_message: this.handleReceivedMessage,
			viewed_message: this.handleViewedMessage,
			typing_message: this.handleTypingMessage,

			get_data: this.handleGetData,
			get_all_data: this.handleGetAllData,
			update_data: this.handleUpdateData,
			delete_data: this.handleDeleteData,

			success: this.handleSuccess,
			error: this.handleError,
			warning: this.handleWarning,
			info: this.handleInfo,
		};

		this.handlers = handlers;
		this.connectSocket();
		// this.setListeners(this.nativeListeners, handlers);
	}

	/**
	 * Methode pour initier la connexion et déclencher les listeners.
	 * Si la conenxion ne se fait pas au bout de 5 seconde, une notif d'erreur apparait
	 */
	async connectSocket() {
		console.log("Connexion à " + this.url);
		let socket = await io(this.url, { cors: { origins: "*" } });
		this.socket = socket;
		this.timeoutConnexion(); //TODO verification régulière ?
		this.login();
		this.socket.on("connect_error", () => {
			// console.log('ERROR', err)
			//TODO tenter une reconnection ?
			this.timeoutConnexion();
		});
		this.setListeners(this.nativeListeners, this.handlers);
	}

	/**
	 * Parametrer les listeners natifs et leur handlers associés et les listeners/handlers secondaires
	 * @param {io.Socket} socket socket emettant l'event
	 * @param {String} listener nom de l'evenement
	 * @param {Function} handler
	 */
	setListeners(nativeListeners, handlers = {}) {
		console.log("🖥 WebsocketServer start");

		//Event natif
		for (let listener in nativeListeners) {
			let handler = this.nativeListeners[listener];
			this.setListener(this.socket, listener, handler);
		}

		//Event externe
		for (let listener in handlers) {
			let handler = handlers[listener];
			this.setListener(this.socket, listener, handler);
		}
	}

	/**
	 * Parametrer un listener et sont handler associé
	 * @param {io.Socket} socket socket emettant l'event
	 * @param {String} listener nom de l'evenement
	 * @param {Function} handler
	 */
	setListener(socket, listener, handler) {
		socket.on(listener, (data) => {
			console.log("listener", listener);
			this.lastData = data;
			this.lastEvent = listener;
			try {
				handler.bind(this, data)();
			} catch (error) {
				console.error(`ClientError ${listener}`, data, error);
			}
		});
	}

	timeoutConnexion(timer = 5000) {
		setTimeout(() => {
			if (this.socket && this.socket.connected) return;
			this.socket = undefined;
			this.notifToApp("error", {title: "Connexion impossible",message: "Le serveur ne repond pas"})

		}, timer);
	}

	// ======= EMETRE DES EVENTS ====================================================================
	/**
	 * Met a jour les donnée de l'utilisateur en provenance du serveur
	 */
	 saveUserData(data = {}) {
		console.log("saveUserData");
		throw new Error("This function must be overcharged");

	}

	/**
	 * Envoie une requete de login avec priorité au données en local si pas d'argument fournit
	 */
	login(username, token) {
		this.socket.emit("login", { username, token });
	}

	logout() {
		this.socket.emit("logout");
	}

	/**
	 * Connecter l'utilisateur actuel a un lobby
	 * @param {*} lobbyId
	 * @param {*} token Certain lobby necessite un token pour se connecter
	 */
	connectLobby(lobbyId, token) {
		this.socket.emit("connect_lobby", { lobby: { id: lobbyId, token } });
	}

	/**
	 * Déconnecter l'utilisateur actuel d'un lobby
	 * @param {*} lobbyId Id du lobby
	 * @param {*} token Certain lobby necessite un token pour se connecter
	 */
	disconnectLobby(lobbyId, token) {
		this.socket.emit("disconnect_lobby", { lobby: { id: lobbyId, token } });
	}

	/**
	 * Envoyer une evenement message
	 * @param {*} lobbyId Id du lobby
	 * @param {*} content Message
	 */
	async sendMessage(lobbyId, content, token) {
		await this.socket.emit("send_message", { lobby: { id: lobbyId, token }, content });
	}

	/**
	 * Indiquer qu'un message a été recu
	 * @param {*} lobby lobby contenant le message
	 * @param {*} message message correctement recu
	 * @param {*} token token justifiant l'acces si besoin
	 */
	async receivedMessage(lobbyId, messageId, token) {
		await this.socket.emit("received_message", {
			lobby: { id: lobbyId, token },
			message: { id: messageId },
		});
	}

	/**
	 * Indiquer qu'un message a été vus
	 * @param {*} lobbyId lobby contenant le message
	 * @param {*} message message correctement recu
	 * @param {*} token token justifiant l'acces si besoin
	 */
	async viewedMessage(lobbyId, messageId, token) {
		await this.socket.emit("viewed_message", {
			lobby: { id: lobbyId, token },
			message: { id: messageId },
		});
	}

	/**
	 * Indiquer qu'un message est en cour de redaction dans un lobby
	 * @param {*} lobbyId lobby contenant le message
	 * @param {*} token token justifiant l'acces si besoin
	 */
	async typingMessage(lobbyId, token) {
		await this.socket.emit("typing_message", { lobby: { id: lobbyId, token } });
	}

	async getData(id, type) {
		await this.socket.emit("get_data", { id, type });
	}

	async getAllData(token) {
		await this.socket.emit("get_all_data", { token });
	}

	// ======= REACTIONS AUX EVENTS ====================================================================
	/**
	 * Reception d'un evenement login
	 */
	handleLogin(data) {
		this.saveUserData(data);
	}

	handleLogout() {}

	handleDisconnect() {}

	handleUpdateUser(data) {
		this.saveUserData(data);
	}

	handleConnectLobby(data) {}
	handleDisconnectLobby() {}

	//===== TCHAT ==================================================================
	handleSendMessage(data) {}
	handleReceivedMessage(data) {}
	handleViewedMessage(data) {}
	handleTypingMessage(data) {}

	// GESTION DES DONNEES ============================================================
	/**
	 * Fonction de sauvegarde des données recu, relié a l'application ( a surcharger)
	 * @param {String} id
	 * @param {String} type
	 * @param {Object} value Donnée
	 */
	saveData(id, type, value) {
		throw new Error("This function must be overcharged");
	}

	/**
	 * Fonction d'update des données recu, relié a l'application ( a surcharger)
	 * @param {String} id
	 * @param {String} type
	 * @param {Object} value Donnée
	 */
	updateData(id, type, value) {
		throw new Error("This function must be overcharged");
	}
	/**
	 * Fonction de suppression des données recu, relié a l'application ( a surcharger)
	 * @param {String} id
	 * @param {String} type
	 * @param {Object} value Donnée
	 */
	deleteData(id, type, value) {
		throw new Error("This function must be overcharged");
	}

	//=====================================================================================
	handleGetData(data) {
		let { type, id } = data;
		this.saveData(id, type, data);
	}

	handleGetAllData(data) {
		for (let i in data) this.handleGetData(data[i]);
	}

	handleUpdateData(data) {
		let { type, id } = data;
		this.updateData(id, type, data);
	}
	handleDeleteData(data) {
		let { type, id } = data;
		this.deleteData(id, type, data);
	}

	//===== NOTIFICATIONS ==========================================================

	/**
	 * Fonction de notification relié a l'application ( a surcharger)
	 * @param {String} type
	 * @param {Object} data Donnée
	 */
	notifToApp(type, data) {
		console.log(type, data);
		throw new Error("This function must be overcharged");
	}

	handleSuccess(data) {
		this.notifToApp("success", data);
	}
	handleError(data) {
		this.notifToApp("error", data);
	}
	handleWarning(data) {
		this.notifToApp("warning", data);
	}
	handleInfo(data) {
		this.notifToApp("info", data);
	}
}
