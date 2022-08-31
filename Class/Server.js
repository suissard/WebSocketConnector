// Serveur WebSocket universel
const io = require("socket.io"); //(3000, { cors: { origin: "*" } });

const LobbysManager = require("./LobbysManager.js");
const MessagesManager = require("./MessagesManager.js");
const GamesManager = require("./Games/GameManager.js");
const UsersManager = require("./UsersManager.js");
const User = require("./User.js");


/**
 *
 * @param {*} srv
 * @param {*} options Option du server
 */
class Server extends io.Server {
	/**
	 *
	 * @param {*} srv
	 * @param {*} options
	 */
	constructor(srv, options) {
		super(srv, options);
		//TODO construire les event et leur function asscoccié, dans des fichier indépednant
		this.events = [
			"Login",
			"Logout",
			"Disconnect",
			"UpdateUser",

			"ConnectLobby",
			"DisconnectLobby",
			"SendMessage",
			"ReceivedMessage",
			"ViewedMessage",
			"StartTypingMessage",

			"Data",
			"GetAll",

			"CreateGame",
			"UpdateGame",
			"ActionGame",

			"PublishTopic",
			"ConnectedObjectAction",
		];

		this.users = new UsersManager();
		this.lobbys = new LobbysManager();
		this.games = new GamesManager();
		this.messages = new MessagesManager();

		this.setListener();
	}

	setListener() {
		console.log("🖥 WebsocketServer start ...");
		this.on("connection", (socket) => {
			this.handleConnection(socket);
			for (let i in this.events) {
				try {
					if (!this[`handle${this.events[i]}`]) continue;
					socket.on(this.events[i], (data) => {
						let authUser = this.users.findUserWithSocket(socket);
						if (!authUser && !["Login", "connexion"].includes(this.events[i]))
							return socket.emit("error", {
								title: "Authentifiez-vous",
								message: "Il faut etre authentifié pour profiter de ces fonctionnalités",
							});

						try {
							console.log(
								`📥 ${this.events[i]} from ${socket.id}--${socket.request.connection.remoteAddress}`,
								data
							);
							this[`handle${this.events[i]}`](authUser, data, socket);
						} catch (error) {
							console.error(
								`ERROR ${this.events[i]} from ${socket.request.connection.remoteAddress}`,
								data,
								error
							);
							// authUser.error(error.message);
						}
					});
				} catch (error) {
					console.error(this.events[i], error);
				}
			} // Differents évenements a écouter

			//log toute les emissions
			// socket.onAny((eventName, data) => {
			// 	console.log(
			// 		`📤 ${eventName} to ${socket.id}--${socket.request.connection.remoteAddress}`,
			// 		data
			// 	);
			// });
		});
	}

	// PRISE EN CHARGE DES EVENEMENTS ========================================================================================
	/**
	 * Connection initial au server d'un client. SI pas d'utilisateur correspondant, en créer un
	 * @param {Socket} socket
	 */
	handleConnection(socket) {
		console.log(`📥 Connection depuis`, socket.request.connection.remoteAddress);
	}

	/**
	 * Evenement de connexion ou reconnexion d'un utilisateur
	 * verifie le token fournit avec ceux existant et associe le socket
	 * @param {Socket} socket
	 * @param {Object} data
	 */
	handleLogin(authUser, data, socket) {
		let user = this.users.loginUser(socket, data);
		user.emit("Login", this.users.getInfo(user.getId(), user));

// TODO Envoyer toutes les informations
		// for (let i in allData) user.emit("dataUpdate", allData[i]);
	}

	/**
	 * Evenement de mise a jour d'un utilisateur
	 * @param {Socket} socket
	 * @param {Object} data
	 */
	handleUpdateUser(authUser, data, socket) {
		let { username, token } = data;
		//verifie si existance d'un utilisateur relié a ce token
		let user = this.users.checkUserAccess(authUser.getId(), authUser, token);
		// let user = this.users.findUserWithToken(token);
		if (!user) {
			if (!authUser)
				return socket.emit("error", {
					title: "Bug du serveur",
					message: "Raffraichissez la page",
				});
			throw new Error({
				title: `Changement de nom impossible`,
				message: "Le token d'authentification est invalide",
			});
		}
		this.users.updateUser(user, data);
	}

	/**
	 * Evenement de deconnection d'un utilisateur
	 * TODO plutot suppression de compte
	 * @param {Socket} socket
	 */
	handleLogout(authUser) {
		if (!authUser) throw new Error(`Utilisateur déjà déconnecté`);
		this.users.logoutUser(authUser);
	}

	/**
	 * Evenement de connexion a un lobby
	 * TODO a tester
	 * @param {Socket} socket
	 * @param {Object} data
	 */
	handleConnectLobby(authUser, data) {
		let { id, token } = data;

		if (id === undefined) throw new Error("Pas d'id de lobby fournit");

		let lobby = this.lobbys.get(id);
		if (!lobby) lobby = this.lobbys.create(authUser, data, token, undefined, id);

		this.lobbys.connect(id, authUser, token); // Connection d'un utilisateur
		authUser.emit("ConnectLobby", this.lobbys.getInfo(lobby.getId(), authUser));
	}

	/**
	 * Evenement de deconnexion à un lobby
	 * TODO a tester
	 * @param {Socket} socket
	 * @param {Object} data
	 */
	handleDisconnectLobby(authUser, data) {
		console.log(authUser.username, data);
		let { id, token } = data;
		let lobby = this.lobbys.checkUserAccess(id, authUser, token);
		lobby.disconnect(authUser); // Déconnection d'un utilisateur
	}

	handleDisconnect(authUser) {}

	// EVENEMENT DE MESSAGES ================================================
	/**
	 * Evenement d'envois de message dans un lobby
	 * @param {Socket} socket
	 * @param {Object} data
	 */
	handleSendMessage(authUser, data) {
		let { id, token, content } = data;
		let lobby = this.lobbys.checkUserAccess(id, authUser, token);
		return lobby.createMessage(content, authUser);
	}

	/**
	 * Evenement de confirmation de reception de message
	 * @param {Socket} socket
	 * @param {Object} data
	 */
	handleReceivedMessage(authUser, data) {
		let { lobby, message, token } = data;
		const lobbyObject = this.lobbys.checkUserAccess(lobby.id, authUser, token);
		const messageObject = lobbyObject.messages.checkUserAccess(
			message.id,
			authUser,
			token
		);
		messageObject.addReceived(authUser);
	}

	/**
	 * Evenement de confirmation de message vus par l'utilisateur
	 * @param {Socket} socket
	 * @param {Object} data
	 */
	handleViewedMessage(authUser, data) {
		let { lobby, message, token } = data;
		const lobbyObject = this.lobbys.checkUserAccess(lobby.id, authUser, token);
		const messageObject = lobbyObject.messages.checkUserAccess(
			message.id,
			authUser,
			token
		);
		messageObject.addViewed(authUser);
	}

	/**
	 * Evenement de début d'écriture d'un utilisateur
	 * @param {Socket} socket
	 * @param {Object} data
	 */
	handleTypingMessage(authUser, data) {
		let { lobby, message, token } = data;
		const lobbyObject = this.lobbys.checkUserAccess(lobby.id, authUser, token);
		const messageObject = lobbyObject.messages.checkUserAccess(
			message.id,
			authUser,
			token
		);
		messageObject.typing(authUser);
	}

	//EVENEMENT DE GAME ======================================================
	/**
	 *
	 * @param {User} authUser
	 * @param {Object} data donnée de la requete
	 * @param {Object} data.lobbyId type d'action de jeu
	 */
	handleCreateGame(authUser, data) {
		let lobby = this.lobbys.checkUserAccess(data.lobbyId, authUser, data.token);
		this.games.createGame(lobby, authUser, data);
	}
	handleUpdateGame(authUser, data) {
		let lobby = this.lobbys.checkUserAccess(data.lobbyId, authUser, data.token);
		let game = this.games.get(data.gameId); ///faire une équibalent pour le sjeux

		if (!game.userIsPresent(authUser))
			throw new Error("L'utilisateur n'est pas présent dans le Jeu", authUser);

		this.games.updateGame(game, lobby, data);
	}
	handleActionGame(authUser, data) {
		//
		let lobby = this.lobbys.checkUserAccess(data.lobbyId, authUser, data.token);
	}

	/**
	 * Verifie si un utilisateur est présent dans une game. Si non, renvoie une erreur
	 * @param {User} authUser Utilisateur authentifié
	 * @param {String} gameId ID de la game
	 * @returns {Boolean | Error}
	 */
	checkUserInGame(authUser, gameId) {
		let game = this.games.get(data.gameId);
		if (!game.userIsPresent(authUser))
			throw new Error("L'utilisateur n'est pas présent dans le Jeu", authUser);
		return true;
	}

	//EVENEMENT DE DATA ======================================================
	handleData(authUser, data) {
		let result = this;

		let path = data.split("/");

		for (let i in path) {
			if (result[path[i]] !== undefined) result = result[path[i]];
			else result = result.get(path[i]);
		}
		result = result.getInfos(authUser);

		authUser.emit("Data", { type: data, data: result });
	}

	handleGetAll(authUser, data) {
		console.log("GetAll", data);
		authUser.emit("GetAll", { type: data, data: JSON.stringify(this.Data) });
	}

	//EVENEMETN DE TOPIC ======================================================
	handlePublishTopic(authUser, data) {
		console.log("handlePublishTopic", data);
		let { topic, value } = data;
		this.client.publish(topic, value);
	}
	handleConnectedObjectAction(authUser, data) {
		console.log("handleConnectedObjectAction", data);
		let { id, type, action, actionID, args } = data;
		let connectedObject = this.client.ConnectedObjects[type].get(id);
		if (!connectedObject) throw new Error("L'objet n'est pas référencé", authUser);
		try {
			connectedObject
				.useAction(action, actionID, args, authUser)
				.then((response) => authUser.emit("awaitResponse", response))
				.catch((err) => {
					authUser.emit("error", err);
				});
		} catch (e) {
			throw new Error(e.message, authUser);
		}
	}
}

module.exports = Server;
