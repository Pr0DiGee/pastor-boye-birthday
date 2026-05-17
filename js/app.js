import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyCbxHyU9MEDqnu1KiyNJldqECF-O2gRADY",
  authDomain: "pastor-boye-birthday.firebaseapp.com",
  projectId: "pastor-boye-birthday",
  storageBucket: "pastor-boye-birthday.firebasestorage.app",
  messagingSenderId: "1091471080215",
  appId: "1:1091471080215:web:c1f792058e0db5a357d552"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- State & Constants ---
const VAULT_PASSWORD = "PB20261805";
let loadedWishes = {};

// --- DOM Elements ---
// Views
const views = document.querySelectorAll('.view');
const viewLanding = document.getElementById('landing-page');
const viewUpload = document.getElementById('upload-portal');
const viewVaultLogin = document.getElementById('vault-login');
const viewVaultList = document.getElementById('vault-list');
const viewVaultDetail = document.getElementById('vault-detail');

// Navigation Buttons
const btnToUpload = document.getElementById('btn-to-upload');
const btnToVault = document.getElementById('btn-to-vault');
const btnsBackHome = document.querySelectorAll('.btn-back-home');
const btnBackToList = document.getElementById('btn-back-to-list');

// Media Players globally to stop on view change
const heroVideo = document.getElementById('hero-video');
const detailAudio = document.getElementById('detail-audio');
const detailVideo = document.getElementById('detail-video');

// --- Autoplay Video on Scroll ---
if (heroVideo) {
    const videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                heroVideo.play().catch(e => console.log("Autoplay prevented:", e));
            } else {
                heroVideo.pause();
            }
        });
    }, { threshold: 0.5 });
    videoObserver.observe(heroVideo);
}

// Appreciation Form
const formAppreciation = document.getElementById('appreciation-form');
const inputApprAuthor = document.getElementById('appreciation-author');
const inputApprText = document.getElementById('appreciation-text');
const appreciationList = document.getElementById('appreciation-list');

// Upload Form
const formUpload = document.getElementById('upload-form');
const inputUploadName = document.getElementById('upload-name');
const inputUploadMessage = document.getElementById('upload-message');
const inputUploadImage = document.getElementById('upload-image');
const inputUploadVideo = document.getElementById('upload-video');
const btnRecordAudio = document.getElementById('btn-record-audio');
const btnStopAudio = document.getElementById('btn-stop-audio');
const audioPlayback = document.getElementById('audio-playback');
const audioVisualizer = document.getElementById('audio-visualizer');
let mediaRecorder;
let audioChunks = [];
let generatedAudioFile = null;
let visualizerAnimationId;
const btnSubmitUpload = document.getElementById('btn-submit-upload');
const uploadError = document.getElementById('upload-error');
const uploadSuccess = document.getElementById('upload-success');

// Vault Login
const inputPassword = document.getElementById('vault-password');
const btnLogin = document.getElementById('btn-login');
const loginError = document.getElementById('login-error');

// Vault List
const vaultContactList = document.getElementById('vault-contact-list');

// Vault Detail Elements
const detailName = document.getElementById('detail-name');
const detailImage = document.getElementById('detail-image');
const detailMessage = document.getElementById('detail-message');
const detailMessageContainer = document.getElementById('detail-message-container');
const detailAudioContainer = document.getElementById('detail-audio-container');
const detailVideoContainer = document.getElementById('detail-video-container');

// --- View Navigation ---
function switchView(targetView) {
    views.forEach(v => v.classList.remove('active'));
    targetView.classList.add('active');
    
    // Pause any playing media
    if(detailAudio) detailAudio.pause();
    if(detailVideo) detailVideo.pause();
    if(heroVideo) heroVideo.pause();
}

// Event Listeners for Nav
btnToUpload.addEventListener('click', () => {
    uploadSuccess.classList.add('hidden');
    formUpload.classList.remove('hidden');
    formUpload.reset();
    uploadError.textContent = '';
    switchView(viewUpload);
});

btnToVault.addEventListener('click', () => switchView(viewVaultLogin));

btnsBackHome.forEach(btn => {
    btn.addEventListener('click', () => {
        switchView(viewLanding);
        inputPassword.value = '';
        loginError.textContent = '';
    });
});

btnBackToList.addEventListener('click', () => switchView(viewVaultList));

// --- 1. Appreciation Wall Logic ---
function renderAppreciationNote(data, isOptimistic = false) {
    const safeName = escapeHTML(data.author);
    const safeText = escapeHTML(data.text);
    
    const card = document.createElement('div');
    card.className = `message-card ${isOptimistic ? 'optimistic' : ''}`;
    card.innerHTML = `
        <p class="message-text">"${safeText}"</p>
        <p class="message-author">- ${safeName}</p>
    `;
    return card;
}

// Load approved wall notes (Real-time)
const wallQuery = query(collection(db, "wall"), orderBy("timestamp", "asc"));
onSnapshot(wallQuery, (snapshot) => {
    // Remove all dynamically added notes to prevent duplicates, but keep optimistic ones
    document.querySelectorAll('.message-card.dynamic-note').forEach(el => {
        if (!el.classList.contains('optimistic')) el.remove();
    });
    
    snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.approved) {
            const card = renderAppreciationNote(data);
            card.classList.add('dynamic-note');
            appreciationList.prepend(card);
        }
    });
}, (error) => {
    console.error("Error fetching wall messages:", error);
});

formAppreciation.addEventListener('submit', async (e) => {
    e.preventDefault();
    const author = inputApprAuthor.value.trim();
    const text = inputApprText.value.trim();
    if (!author || !text) return;

    try {
        await addDoc(collection(db, "wall"), {
            author: author,
            text: text,
            approved: false, // Must be approved by admin to show permanently
            timestamp: serverTimestamp()
        });
        
        // Optimistic UI update (after success)
        const optimisticData = { author, text };
        const optimisticCard = renderAppreciationNote(optimisticData, true);
        optimisticCard.classList.add('dynamic-note');
        appreciationList.prepend(optimisticCard);

    } catch (error) {
        console.error("Error adding appreciation note: ", error);
        alert("Failed to post note. Please check your connection.");
    }
    // Clear form
    inputApprAuthor.value = '';
    inputApprText.value = '';
});

// --- Carousel Interactivity ---
const carouselTrack = document.querySelector('.carousel-track');
const carouselContainer = document.querySelector('.carousel-container');
let currentTranslate = 0;
let isDragging = false;
let startX = 0;
let prevTranslate = 0;

if (carouselTrack && carouselContainer) {
    // Scroll-linked
    window.addEventListener('scroll', () => {
        if (!isDragging) {
            currentTranslate = -(window.scrollY * 0.5);
            carouselTrack.style.transform = `translateX(${currentTranslate}px)`;
        }
    });

    // Drag / Swipe
    const startDrag = (e) => {
        isDragging = true;
        startX = e.type.includes('mouse') ? e.pageX : e.touches[0].clientX;
        prevTranslate = currentTranslate;
        carouselTrack.style.transition = 'none';
    };

    const moveDrag = (e) => {
        if (!isDragging) return;
        const currentX = e.type.includes('mouse') ? e.pageX : e.touches[0].clientX;
        const deltaX = currentX - startX;
        currentTranslate = prevTranslate + deltaX;
        carouselTrack.style.transform = `translateX(${currentTranslate}px)`;
    };

    const endDrag = () => {
        isDragging = false;
        carouselTrack.style.transition = 'transform 0.1s ease-out';
    };

    carouselContainer.addEventListener('mousedown', startDrag);
    carouselContainer.addEventListener('mousemove', moveDrag);
    window.addEventListener('mouseup', endDrag);

    carouselContainer.addEventListener('touchstart', startDrag, {passive: true});
    carouselContainer.addEventListener('touchmove', moveDrag, {passive: true});
    window.addEventListener('touchend', endDrag);
}

// --- 2. Upload Portal Logic ---
function checkVideoDuration(file) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = function() {
            window.URL.revokeObjectURL(video.src);
            resolve(video.duration);
        }
        video.src = URL.createObjectURL(file);
    });
}

async function uploadToCloudinary(file) {
    if (!file) return null;
    const url = "https://api.cloudinary.com/v1_1/dxmgapcwb/auto/upload";
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "imprint_preset");

    const response = await fetch(url, {
        method: "POST",
        body: formData
    });

    if (!response.ok) {
        throw new Error("Failed to upload to Cloudinary");
    }

    const data = await response.json();
    return data.secure_url;
}

// Native Voice Recording
if (btnRecordAudio && btnStopAudio) {
    btnRecordAudio.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            // Setup Visualizer
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioCtx.createAnalyser();
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 256;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            const canvasCtx = audioVisualizer.getContext('2d');
            
            audioVisualizer.classList.remove('hidden');
            audioPlayback.classList.add('hidden');

            function draw() {
                visualizerAnimationId = requestAnimationFrame(draw);
                analyser.getByteFrequencyData(dataArray);
                
                canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                canvasCtx.fillRect(0, 0, audioVisualizer.width, audioVisualizer.height);
                
                const barWidth = (audioVisualizer.width / bufferLength) * 2.5;
                let barHeight;
                let x = 0;
                
                for(let i = 0; i < bufferLength; i++) {
                    barHeight = dataArray[i] / 4; // Scale down for 50px height
                    // Color based on height (yellow/gold to red)
                    canvasCtx.fillStyle = `rgb(255, ${200 - barHeight * 2}, 0)`;
                    canvasCtx.fillRect(x, audioVisualizer.height - barHeight, barWidth, barHeight);
                    x += barWidth + 1;
                }
            }
            draw();

            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                generatedAudioFile = new File([audioBlob], "voicenote.webm", { type: 'audio/webm' });
                const audioUrl = URL.createObjectURL(audioBlob);
                audioPlayback.src = audioUrl;
                
                cancelAnimationFrame(visualizerAnimationId);
                audioVisualizer.classList.add('hidden');
                audioPlayback.classList.remove('hidden');
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            btnRecordAudio.classList.add('hidden');
            btnStopAudio.classList.remove('hidden');
        } catch (err) {
            console.error("Mic access denied or error:", err);
            alert("Microphone access is required to record a voice note.");
        }
    });

    btnStopAudio.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            btnRecordAudio.classList.remove('hidden');
            btnStopAudio.classList.add('hidden');
        }
    });
}

formUpload.addEventListener('submit', async (e) => {
    e.preventDefault();
    uploadError.textContent = '';
    
    const name = inputUploadName.value.trim();
    const message = inputUploadMessage.value.trim();
    const imageFile = inputUploadImage.files[0];
    const audioFile = generatedAudioFile;
    const videoFile = inputUploadVideo.files[0];

    // Strict Validation
    if (!name) {
        uploadError.textContent = "Name is required.";
        return;
    }

    if (videoFile) {
        // Size check (30MB = 30 * 1024 * 1024 bytes)
        if (videoFile.size > 30 * 1024 * 1024) {
            uploadError.textContent = "Video size exceeds 30MB limit.";
            return;
        }
        // Duration check
        const duration = await checkVideoDuration(videoFile);
        if (duration > 30.5) { // Giving 0.5s leeway
            uploadError.textContent = `Video duration (${Math.round(duration)}s) exceeds 30s limit.`;
            return;
        }
    }

    btnSubmitUpload.disabled = true;
    btnSubmitUpload.textContent = 'Uploading... Please wait.';

    try {
        const customImageUrl = imageFile ? await uploadToCloudinary(imageFile) : null;
        const audioUrl = audioFile ? await uploadToCloudinary(audioFile) : null;
        const videoUrl = videoFile ? await uploadToCloudinary(videoFile) : null;

        await addDoc(collection(db, "wishes"), {
            name,
            message,
            customImageUrl,
            audioUrl,
            videoUrl,
            timestamp: serverTimestamp()
        });

        // Show success state
        formUpload.classList.add('hidden');
        uploadSuccess.classList.remove('hidden');
        
        // Reset generated audio
        generatedAudioFile = null;
        if(audioPlayback) {
            audioPlayback.src = '';
            audioPlayback.classList.add('hidden');
        }
        if(audioVisualizer) {
            audioVisualizer.classList.add('hidden');
        }

    } catch (err) {
        console.error("Upload error:", err);
        uploadError.textContent = "An error occurred during upload. Please try again.";
    } finally {
        btnSubmitUpload.disabled = false;
        btnSubmitUpload.textContent = 'Send Message';
    }
});


// --- 3. Vault Login & List Logic ---
btnLogin.addEventListener('click', handleLogin);
inputPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
});

function handleLogin() {
    if (inputPassword.value === VAULT_PASSWORD) {
        switchView(viewVaultList);
        inputPassword.value = '';
        loginError.textContent = '';
        initVaultListener(); // Start listening when logged in
    } else {
        loginError.textContent = 'Incorrect passcode.';
    }
}

let vaultUnsubscribe = null;

function initVaultListener() {
    if (vaultUnsubscribe) return; // Already listening

    const wishesQuery = query(collection(db, "wishes"), orderBy("timestamp", "desc"));
    vaultUnsubscribe = onSnapshot(wishesQuery, (snapshot) => {
        vaultContactList.innerHTML = '';
        loadedWishes = {};

        if (snapshot.empty) {
            vaultContactList.innerHTML = '<div class="contact-item"><div class="contact-info"><p class="contact-preview">No wishes yet.</p></div></div>';
            return;
        }

        snapshot.forEach((doc) => {
            const data = doc.data();
            const id = doc.id;
            loadedWishes[id] = data;
            
            console.log("Vault incoming data:", data);

            // Generate preview snippet
            let preview = data.message || "";
            if (!preview) {
                if (data.videoUrl) preview = "Video message attached";
                else if (data.audioUrl) preview = "Voice note uploaded";
                else if (data.customImageUrl) preview = "Image uploaded";
            } else {
                if (preview.length > 40) preview = preview.substring(0, 40) + "...";
            }

            const item = document.createElement('div');
            item.className = 'contact-item';
            item.onclick = () => openVaultDetail(id);
            item.innerHTML = `
                <div class="contact-info">
                    <h3 class="contact-name">${escapeHTML(data.name)}</h3>
                    <p class="contact-preview">${escapeHTML(preview)}</p>
                </div>
            `;
            vaultContactList.appendChild(item);
        });
    }, (error) => {
        console.error("Error fetching vault messages:", error);
        vaultContactList.innerHTML = '<div class="contact-item"><div class="contact-info"><p class="contact-preview" style="color:red;">Error loading messages.</p></div></div>';
    });
}

function openVaultDetail(id) {
    const data = loadedWishes[id];
    if (!data) return;

    detailName.textContent = data.name;
    
    // Handle Message Text
    if (data.message) {
        detailMessage.textContent = data.message;
        detailMessageContainer.classList.remove('hidden');
    } else {
        detailMessage.textContent = '';
        detailMessageContainer.classList.add('hidden');
    }

    // Handle Image
    let finalImageUrl = data.customImageUrl;
    if (finalImageUrl) {
        finalImageUrl = finalImageUrl.replace(/\.heic$/i, '.jpg');
    }
    detailImage.classList.remove('hidden');
    detailImage.src = finalImageUrl ? finalImageUrl : 'assets/pastor_boye.png';
    detailImage.alt = `Photo for ${data.name}`;

    // Handle Audio
    if (data.audioUrl) {
        detailAudio.src = data.audioUrl;
        detailAudioContainer.classList.remove('hidden');
    } else {
        detailAudio.src = '';
        detailAudioContainer.classList.add('hidden');
    }

    // Handle Video
    if (data.videoUrl) {
        detailVideo.src = data.videoUrl;
        detailVideoContainer.classList.remove('hidden');
    } else {
        detailVideo.src = '';
        detailVideoContainer.classList.add('hidden');
    }

    switchView(viewVaultDetail);
}

// Utility function to escape HTML and prevent XSS
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
