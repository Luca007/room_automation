# Automação do Quarto (Frontend Web)

Interface web em HTML/CSS/JS puro para controlar dispositivos do quarto via Firebase (Auth + Firestore) seguindo a estrutura de shadow (desired / reported).

## Estrutura esperada no Firestore

```text
devices (collection)
	luz_do_quarto (document)
		shadow (collection)
			desired (document)
				on: boolean
				seq: number
				updatedAt: timestamp
				updatedBy: { source, uid }
				source: string (ex: "web")
				uid: string
			reported (document)
				on: boolean
				by: string (ex: "esp32")
				reason: string (ex: "remote")
				updatedAt: timestamp
```

## Funcionalidades

* Login / Registro por email + senha
* Login com Google
* Controle ON/OFF (atualiza `shadow/desired`)
* Atualização em tempo real (listeners em `desired` e `reported`)
* Cálculo simples de latência (diferença entre `updatedAt` de desired vs reported)
* Design dark com foco em usabilidade e responsividade

## Configuração

1. Crie um projeto no Firebase e ative Authentication (Email/Password e Google) e Firestore.
2. Copie a configuração Web do Firebase para o arquivo `firebase.js` substituindo os placeholders:

```js
const firebaseConfig = {
	apiKey: '...',
	authDomain: 'PROJECT_ID.firebaseapp.com',
	projectId: 'PROJECT_ID',
	storageBucket: 'PROJECT_ID.appspot.com',
	messagingSenderId: '...',
	appId: '...'
};
```

3. Garanta regras de segurança adequadas para permitir somente usuários autenticados alterarem `desired`.

### Exemplo de Regras (ajuste conforme necessidade)

```
rules_version = '2';
service cloud.firestore {
	match /databases/{database}/documents {
		match /devices/{deviceId}/shadow/{docId} {
			allow read: if request.auth != null;
			allow write: if request.auth != null && docId == 'desired';
		}
	}
}
```

## Executando

Como é apenas frontend estático, basta abrir `index.html` em um servidor local (recomendado para evitar bloqueios CORS em algumas features). Exemplos:

### Python (opcional)
```
python -m http.server 5500
```
Abra http://localhost:5500/

### VS Code Live Server
Utilize a extensão Live Server e abra `index.html`.

## Expansão futura

* Listar dispositivos dinamicamente (buscar documentos em `devices`)
* Histórico de eventos
* Perfis / favoritos
* Modo de cenas / automações
* PWA / instalação local

## Licença

Uso pessoal.