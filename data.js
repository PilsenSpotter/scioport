const firebaseConfig = {
    apiKey: "AIzaSyBYQPQwKYJLxcdjHHMv8w1KbLIIX-HKaQA",
    authDomain: "scioport.firebaseapp.com",
    projectId: "scioport",
    storageBucket: "scioport.appspot.com",
    messagingSenderId: "612919891675",
    appId: "1:612919891675:web:3adef562f38e26c80e5efe",
    measurementId: "G-7BW8NQ1VKC"
};
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const loginUrl = new URL('login/index.html', window.location.href).toString();

let adminMode = false;

document.addEventListener('DOMContentLoaded', function() {
  const adminButton = document.getElementById('admin');
  if (adminButton) {
    adminButton.onclick = async function() {
      adminMode = !adminMode;
      await renderData();
    };
  }
});

async function renderData() {
  const user = firebase.auth().currentUser;
  if (!user) return;

  let dataHtml = '';

  if (adminMode) {
    const usersSnapshot = await db.collection('users').get();
    const promises = usersSnapshot.docs.map(userDoc => {
      const userEmail = userDoc.data().email || userDoc.id;
      return db.collection('users').doc(userDoc.id).collection('data').orderBy('timestamp', 'desc').get()
        .then(dataSnapshot => {
          let userData = `<h1>${userEmail}</h1>`;
          if (dataSnapshot.empty) {
            userData += `<span style="color:gray;">No data</span>`;
          } else {
            dataSnapshot.forEach(doc => {
              userData += `<span>${doc.data().value}</span><br>`;
            });
          }
          userData += `<hr>`;
          return userData;
        });
    });
    const allUsersData = await Promise.all(promises);
    dataHtml = allUsersData.join('');
    document.getElementById('user-data').innerHTML = dataHtml;
    document.getElementById('user-email').textContent = "Admin Mode: All Users";
  } else {
    document.getElementById('user-email').textContent = user.email;
    const dataRef = db.collection('users').doc(user.uid).collection('data');
    const snapshot = await dataRef.orderBy('timestamp', 'desc').get();
    snapshot.forEach(doc => {
      dataHtml += `<span>${doc.data().value}</span><br>`;
    });
    document.getElementById('user-data').innerHTML = dataHtml;
  }
}

firebase.auth().onAuthStateChanged(async function(user) {
  if (user) {
    await db.collection('users').doc(user.uid).set({
      email: user.email
    }, { merge: true });
    await renderData();
  } else {
    window.location.replace(loginUrl);
  }
});
