// ════════════════════════════════════════════════
// CONSTANTS (8 KIOSK SERVICES)
// ════════════════════════════════════════════════
const SVCS=['Customer Service','Billing','Consultation','Technical Support','Order Pickup','Account Opening', 'General Enquiries', 'Card Collection'];
const ICOS={'Customer Service':'🎧','Billing':'🧾','Consultation':'📋','Technical Support':'🔧','Order Pickup':'📦','Account Opening':'🏦', 'General Enquiries':'❓', 'Card Collection':'💳'};
const PFX={'Customer Service':'A','Billing':'B','Consultation':'C','Technical Support':'T','Order Pickup':'P','Account Opening':'N', 'General Enquiries':'E', 'Card Collection':'C'};

// VIP / Priority Weighting Dictionary
const PRIORITY_WEIGHTS = {
  'Emergency': 4,
  'Elderly / Disability': 3,
  'VIP': 2,
  'Normal': 1
};

const NAV_CFG={
  admin:[
    {sec:'Main'},{id:'dashboard',lbl:'Dashboard',ico:'📊',pg:'dashboard'},
    {id:'issue',lbl:'Issue Card',ico:'🎫',pg:'issue'},
    {sec:'Operations'},{id:'staff',lbl:'Staff Panel',ico:'🖥',pg:'staff'},
    {id:'display',lbl:'Display Screen',ico:'📺',pg:'public-display'},
    {sec:'Insights'},{id:'analytics',lbl:'Analytics',ico:'📈',pg:'analytics'},
    {id:'history',lbl:'Queue History',ico:'📋',pg:'history'},
    {id:'services',lbl:'Counters & Services',ico:'⚙️',pg:'services'},
  ],
  staff:[
    {sec:'Operations'},{id:'staff',lbl:'My Counter',ico:'🖥',pg:'staff'},
    {id:'issue',lbl:'Issue Card',ico:'🎫',pg:'issue'},
    {id:'display',lbl:'Display Screen',ico:'📺',pg:'public-display'},
    {sec:'Queue'},{id:'dashboard',lbl:'Queue Overview',ico:'📊',pg:'dashboard'},
  ],
  customer:[
    {sec:'Queue'},{id:'get-ticket',lbl:'Get Ticket',ico:'🎟',pg:'get-ticket'},
    {id:'track',lbl:'Track My Queue',ico:'📍',pg:'track'},
    {id:'public-display',lbl:'Queue Board',ico:'📺',pg:'public-display'},
    {sec:'Management'},{id:'admin-login',lbl:'Admin Portal',ico:'🔐',pg:'login-redirect'}
  ],
};

const TITLES={dashboard:'Dashboard',issue:'Issue Queue Card',staff:'Staff Panel',display:'Display Screen',analytics:'Analytics',services:'Counters & Services',history:'Queue History','get-ticket':'Get Queue Ticket',track:'Track My Queue','public-display':'Queue Board'};
const API_BASE_URL = 'http://localhost:5050';

// ════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════
let S={
  role:null,username:null,
  queue:[],servingTickets:{},servedToday:[],activities:[],
  counters:[
    {id:1,name:'Counter 1',service:'Customer Service',status:'open',operator:'Sarah K.',color:'#3FB950'},
    {id:2,name:'Counter 2',service:'Billing',status:'open',operator:'Mark T.',color:'#388BFD'},
    {id:3,name:'Counter 3',service:'Technical Support',status:'break',operator:'Lisa M.',color:'#E3B341'},
    {id:4,name:'Counter 4',service:'Consultation',status:'closed',operator:'James R.',color:'#A78BFA'},
  ],
  nextCtrId:5,
  myTicket:null,currentSvc:'Customer Service',
  editingCtrId:null,
  selectedColor:'#388BFD',
};

// Smart Queue Sorting (Priority + FIFO)
function getSortedQueue() {
  return S.queue
    .filter(q => q.status === 'Waiting' || q.status === 'waiting')
    .sort((a, b) => {
      const weightA = PRIORITY_WEIGHTS[a.priority] || 1;
      const weightB = PRIORITY_WEIGHTS[b.priority] || 1;
      if (weightA !== weightB) return weightB - weightA; 
      return new Date(a.issuedAt) - new Date(b.issuedAt); 
    });
}

// Predictive Wait Time
function calculateEstWait(serviceType, priority) {
  const w = getSortedQueue();
  const aheadOfMe = w.filter(q => (PRIORITY_WEIGHTS[q.priority] || 1) >= (PRIORITY_WEIGHTS[priority] || 1)).length;
  return (aheadOfMe * 4) + 2; 
}

// ════════════════════════════════════════════════
// THEME & SIDEBAR
// ════════════════════════════════════════════════
function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('pinpoint_theme', newTheme);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = newTheme === 'dark' ? '🌙' : '☀️';
}

if (localStorage.getItem('pinpoint_theme') === 'light') toggleTheme();

function toggleSidebar(forceOpen) {
  const sidebar = document.querySelector('aside');
  const backdrop = document.getElementById('mobile-nav-backdrop');
  if (!sidebar) return;

  const shouldOpen = typeof forceOpen === 'boolean'
    ? forceOpen
    : !sidebar.classList.contains('open');

  sidebar.classList.toggle('open', shouldOpen);
  if (backdrop) backdrop.classList.toggle('open', shouldOpen);
}

// ════════════════════════════════════════════════
// REAL-TIME CONNECTION (SOCKET.IO)
// ════════════════════════════════════════════════
const socket = io(API_BASE_URL);

socket.on('connect', () => {
  console.log('🟢 Connected to PinPoint Live Server!');
});

socket.on('new-ticket', (ticketData) => {
  showToast('🔔', 'New Ticket Generated', `Ticket ${ticketData.ticketNumber} joined the queue`, 'blue');
  S.queue.push({
    id: ticketData._id,
    number: ticketData.ticketNumber,
    service: ticketData.serviceType,
    name: ticketData.customerName || 'Guest',
    priority: ticketData.priority || 'Normal',
    phone: ticketData.phone || '', 
    notes: ticketData.notes || '',
    counter: 'Auto-assigned',
    issuedAt: new Date(ticketData.issuedAt),
    status: 'waiting',
    estimatedWait: calculateEstWait(ticketData.serviceType, ticketData.priority)
  });
  renderDash(); renderStaff(); updateDisps();
});

socket.on('ticket-called', (ticket) => {
  S.queue = S.queue.filter(q => q.number !== ticket.ticketNumber);
  S.servingTickets[ticket.counter] = ticket;
  
  renderDash(); renderStaff(); updateDisps();
  
  if (S.role === 'customer') {
    const chime = new Audio('https://www.soundjay.com/buttons/sounds/beep-07.mp3');
    chime.play().catch(() => {}); 
    
    setTimeout(() => {
      const speech = new SpeechSynthesisUtterance();
      const spokenNumber = ticket.ticketNumber.split('-').join(' '); 
      speech.text = `Now calling ticket ${spokenNumber} to ${ticket.counter}`;
      speech.rate = 0.85; 
      speech.pitch = 1;
      window.speechSynthesis.speak(speech);
    }, 1000);
  }
});

// GLOBAL TICKET COMPLETED EVENT (Updates Admin History)
socket.on('ticket-completed', (ticket) => {
  if (S.servingTickets[ticket.counter] && S.servingTickets[ticket.counter].ticketNumber === ticket.ticketNumber) {
    delete S.servingTickets[ticket.counter];
  }
  // Add to the admin history table globally
  addAct(ticket, 'Served');
  renderDash(); renderStaff(); updateDisps();
});

socket.on('ticket-skipped', (ticket) => {
  if (S.servingTickets[ticket.counter] && S.servingTickets[ticket.counter].ticketNumber === ticket.ticketNumber) {
    delete S.servingTickets[ticket.counter];
  }
  addAct(ticket, 'Skipped');
  renderDash(); renderStaff(); updateDisps();
});

// ════════════════════════════════════════════════
// INITIALIZATION & BOOT SEQUENCE
// ════════════════════════════════════════════════
const wooshSound = new Audio('https://www.soundjay.com/misc/sounds/wind-swoosh-1.mp3');
wooshSound.volume = 0.2;
let scrollTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
  const loginScreen = document.getElementById('login-screen');
  if (loginScreen) {
      loginScreen.style.display = 'none';
      loginScreen.style.opacity = '0';
  }

  const contentArea = document.querySelector('.scroll-sound');
  if (contentArea) {
    contentArea.addEventListener('scroll', () => {
      if (!scrollTimeout) {
        wooshSound.currentTime = 0;
        let playPromise = wooshSound.play();
        if (playPromise !== undefined) playPromise.catch(() => {});
        scrollTimeout = setTimeout(() => { scrollTimeout = null; }, 500); 
      }
    });
  }

  const savedToken = localStorage.getItem('pinpoint_token');
  if (savedToken) {
    S.username = 'Admin'; S.role = 'admin'; 
    bootApp();
  } else {
    S.role = 'customer'; S.username = 'Guest';
    bootApp();
  }
});

function bootApp() {
  const loginScreen = document.getElementById('login-screen');
  const appContainer = document.getElementById('app');
  
  if (loginScreen) loginScreen.style.display = 'none';
  if (appContainer) appContainer.style.display = 'flex';
  
  const uIcon = S.role === 'admin' ? '🛡' : (S.role === 'staff' ? '🖥' : '👤');
  const rbIco = document.getElementById('rb-ico'); if (rbIco) rbIco.textContent = uIcon;
  const rbName = document.getElementById('rb-name'); if (rbName) rbName.textContent = S.username;
  const rbRole = document.getElementById('rb-role'); if (rbRole) rbRole.textContent = S.role.toUpperCase();
  
  const rc = document.getElementById('tb-role');
  if (rc) {
    rc.textContent = S.role.charAt(0).toUpperCase() + S.role.slice(1);
    rc.className = 'chip ' + (S.role === 'customer' ? 'user-c' : 'admin-c');
  }
  
  buildNav(); buildSvcBtns(); populateStaffCounterSelect();
  syncQueueWithDB(); 

  const first = NAV_CFG[S.role] && NAV_CFG[S.role].find(n => n.pg);
  if (first) showPage(first.pg, first.id);
  
  startClock();
}

async function syncQueueWithDB() {
  try {
    const response = await fetch(API_BASE_URL + '/api/tickets/active');
    if (!response.ok) return;
    const activeTickets = await response.json();
    
    S.queue = activeTickets.filter(t => t.status === 'Waiting').map(t => ({
      id: t._id, number: t.ticketNumber, service: t.serviceType,
      name: t.customerName || 'Guest', priority: t.priority || 'Normal',
      phone: t.phone || '', notes: t.notes || '',
      status: t.status, issuedAt: new Date(t.issuedAt),
      estimatedWait: calculateEstWait(t.serviceType, t.priority)
    }));
    const callingList = activeTickets.filter(t => t.status === 'Serving');
    S.servingTickets = {};
    callingList.forEach(t => S.servingTickets[t.counter] = t);

    renderDash(); renderStaff(); updateDisps();
  } catch (err) { console.error("Sync Error:", err); }
}

// ════════════════════════════════════════════════
// SECURE ADMIN LOGIN
// ════════════════════════════════════════════════
async function doLogin() {
  const u = document.getElementById('lu').value;
  const p = document.getElementById('lp').value;
  const btn = document.getElementById('lbtn');

  if (!u || !p) { showToast('⚠️', 'Missing Fields', 'Enter username and password', 'amber'); return; }
  btn.textContent = 'Authenticating...';

  try {
    const response = await fetch(API_BASE_URL + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('pinpoint_token', data.token); 
      S.username = 'Admin'; S.role = 'admin';
      showToast('✅', 'Access Granted', 'Welcome back!', 'green');
      
      document.getElementById('login-screen').style.opacity = '0';
      setTimeout(() => { bootApp(); }, 400);
    } else {
      showToast('❌', 'Access Denied', 'Invalid credentials', 'red');
      btn.textContent = 'Sign In';
    }
  } catch (err) {
    showToast('❌', 'Error', 'Server unreachable', 'red');
    btn.textContent = 'Sign In';
  }
}

function guestLogin() {
  S.role = 'customer'; S.username = 'Guest Customer';
  document.getElementById('login-screen').style.opacity = '0';
  setTimeout(() => { bootApp(); }, 400);
}

function doLogout() {
  localStorage.removeItem('pinpoint_token');
  location.reload();
}

// ════════════════════════════════════════════════
// NAV & UI
// ════════════════════════════════════════════════
function buildNav(){
  const c=document.getElementById('sb-nav');c.innerHTML='';
  (NAV_CFG[S.role]||[]).forEach(n=>{
    if(n.sec){const d=document.createElement('div');d.className='nsec';d.textContent=n.sec;c.appendChild(d);return;}
    const el=document.createElement('div');el.className='ni';el.id='ni-'+n.id;
    el.innerHTML=`<span class="ni-ico">${n.ico}</span><span>${n.lbl}</span>`;
    el.onclick=()=>showPage(n.pg,n.id);c.appendChild(el);
  });
}

function showPage(pg, nid) {
  if (pg === 'login-redirect') {
      document.getElementById('app').style.display = 'none';
      const ls = document.getElementById('login-screen');
      ls.style.display = 'flex'; ls.style.opacity = '1';
      return;
  }

  document.querySelectorAll('.page').forEach(p => { p.classList.remove('on'); p.style.display = 'none'; });
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('on'));
  
  const p = document.getElementById('page-' + pg);
  if (p) { p.classList.add('on'); p.style.display = ''; }
  
  const n = document.getElementById('ni-' + (nid || pg));
  if (n) n.classList.add('on');
  
  document.getElementById('tb-title').textContent = TITLES[pg] || pg;
  
  const sidebar = document.querySelector('aside');
  if (sidebar && window.innerWidth <= 768) {
    sidebar.classList.remove('open');
    const backdrop = document.getElementById('mobile-nav-backdrop');
    if (backdrop) backdrop.classList.remove('open');
  }

  if (pg === 'dashboard') renderDash();
  if (pg === 'analytics') renderAnalytics();
  if (pg === 'display' || pg === 'public-display') updateDisps();
  if (pg === 'staff') { populateStaffCounterSelect(); renderStaff(); }
  if (pg === 'services') renderSvcs();
}

function buildSvcBtns(){
  const g=document.getElementById('svc-btns');if(!g)return;
  g.innerHTML=SVCS.map(s=>{
    const safeId = s.split(' ').join('-');
    return `<div onclick="selSvc('${s}')" id="sb-${safeId}"
      style="background:var(--surface2);border:2px solid var(--border);border-radius:14px;padding:24px 10px;cursor:pointer;text-align:center;transition:all 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
      <div style="font-size:36px;margin-bottom:12px;">${ICOS[s]}</div>
      <div style="font-size:15px;font-weight:700;">${s}</div>
    </div>`;
  }).join('');
}

function getMyCounter() {
  const sel = document.getElementById('s-ctr');
  if (!sel || sel.options.length === 0) return 'Counter 1';
  return sel.options[sel.selectedIndex].text.split(' — ')[0];
}

function selSvc(serviceName) {
  S.currentSvc = serviceName;
  document.querySelectorAll('#svc-btns > div').forEach(btn => {
    btn.style.borderColor = 'var(--border)';
    btn.style.background = 'var(--surface2)';
  });
  const safeId = serviceName.split(' ').join('-');
  const clickedBtn = document.getElementById(`sb-${safeId}`);
  if (clickedBtn) {
    clickedBtn.style.borderColor = 'var(--blue-lt)';
    clickedBtn.style.background = 'rgba(88, 166, 255, 0.1)';
  }
}

function populateStaffCounterSelect(){
  const sel=document.getElementById('s-ctr');if(!sel)return;
  sel.innerHTML=S.counters.map(c=>`<option value="${c.id}">${c.name} — ${c.service}</option>`).join('');
}

function startClock(){
  function tick(){
    const n=new Date();
    document.getElementById('ck-time').textContent=n.toLocaleTimeString('en-US',{hour12:false});
    document.getElementById('ck-date').textContent=n.toLocaleDateString('en-US',{day:'2-digit',month:'short',year:'numeric'});
    document.getElementById('ck-day').textContent=n.toLocaleDateString('en-US',{weekday:'long'});
    ['d-clk','pub-clk'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=n.toLocaleTimeString('en-US',{hour12:false});});
  }
  tick();setInterval(tick,1000);
}

// ════════════════════════════════════════════════
// KIOSK / TICKETING API
// ════════════════════════════════════════════════

function normalizeKenyanPhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';

  const hasLeadingPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  if (hasLeadingPlus) return `+${digits}`;
  if (digits.startsWith('254') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+254${digits.slice(1)}`;
  if (digits.length === 9) return `+254${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;

  return '';
}

async function genCard() {
  const svc = document.getElementById('g-svc').value;
  const nm = document.getElementById('g-nm').value.trim();
  const pri = document.getElementById('g-pri').value;
  const ph = normalizeKenyanPhone(document.getElementById('g-ph').value);

  if (!nm || !ph) {
    showToast('⚠️', 'Missing Credentials', 'Please enter both the Customer Name and Phone Number.', 'amber');
    return; 
  }

  const payload = {
    serviceType: svc,
    customerName: nm,
    phone: ph,
    priority: pri,
    notes: 'Admin Issued', 
    smsOptIn: false
  };

  try {
    const response = await fetch(API_BASE_URL + '/api/tickets/issue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Server Error');

    const ticket = data;
    const estimatedWait = calculateEstWait(ticket.serviceType, ticket.priority);
    
    document.getElementById('pv-num').textContent = ticket.ticketNumber;
    document.getElementById('pv-svc').textContent = ticket.serviceType;
    document.getElementById('pv-wait').textContent = `~${estimatedWait} mins`;
    document.getElementById('pv-pri').innerHTML = `<span class="b ${pri !== 'Normal' ? 'ba' : 'bb'}">${pri}</span>`;
    document.getElementById('pv-time').textContent = "ISSUED: " + new Date().toLocaleTimeString();
    
    showToast('✅', 'Ticket Generated', `Priority: ${pri}`, 'green');
    clrForm(); 
  } catch (err) {
    showToast('❌', 'Error', 'Could not connect to server', 'red');
  }
}

function clrForm() {
  document.getElementById('g-nm').value = '';
  document.getElementById('g-ph').value = '';
  document.getElementById('g-pri').value = 'Normal';
}

async function custGetTicket() {
  const nameInput = document.getElementById('c-nm');
  const phoneInput = document.getElementById('c-ph');
  const notesInput = document.getElementById('c-notes');
  const smsOptInput = document.getElementById('c-sms-opt');

  const nm = nameInput ? nameInput.value.trim() : '';
  const ph = phoneInput ? normalizeKenyanPhone(phoneInput.value) : '';

  if (!nm || !ph) {
    showToast('⚠️', 'Missing Information', 'Please enter your Name and Phone Number to get a ticket.', 'amber');
    return; 
  }

  const payload = {
    serviceType: S.currentSvc || 'Customer Service',
    customerName: nm,
    phone: ph,
    notes: notesInput ? notesInput.value.trim() : '', 
    smsOptIn: smsOptInput ? smsOptInput.checked : false, // WhatsApp opt-in payload
    priority: 'Normal' 
  };

  try {
    const response = await fetch(API_BASE_URL + '/api/tickets/issue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Server Error');

    const ticket = data;
    const estimatedWait = calculateEstWait(ticket.serviceType, ticket.priority); 
    
    document.getElementById('ct-num').textContent = ticket.ticketNumber;
    document.getElementById('ct-svc').textContent = ticket.serviceType;
    document.getElementById('ct-wait').textContent = `~${estimatedWait} mins`;
    
    const timeEl = document.getElementById('ct-time');
    if (timeEl) timeEl.textContent = "ISSUED: " + new Date().toLocaleTimeString();
    
    const qrEl = document.getElementById('c-qr');
    if (qrEl) qrEl.innerHTML = mkQR(ticket.ticketNumber);
    
    S.myTicket = { number: ticket.ticketNumber };
    
    document.getElementById('page-get-ticket').querySelector('.card').style.display = 'none';
    document.getElementById('c-ticket').style.display = 'block';
    showToast('✅', 'Success', `Ticket generated!`, 'green');

    setTimeout(() => {
        if (S.role === 'customer') {
            document.getElementById('c-ticket').style.display = 'none';
            document.getElementById('page-get-ticket').querySelector('.card').style.display = 'block';
            if (nameInput) nameInput.value = '';
            if (phoneInput) phoneInput.value = '';
            if (notesInput) notesInput.value = ''; 
        }
    }, 10000);

  } catch (err) {
    showToast('❌', 'Error', 'Could not connect to server', 'red');
  }
}

// ════════════════════════════════════════════════
// STAFF OPERATIONS API
// ════════════════════════════════════════════════
async function callNext() {
  try {
    const counterSelect = document.getElementById('s-ctr');
    const selectedCounter = counterSelect && counterSelect.options.length > 0 
      ? counterSelect.options[counterSelect.selectedIndex].text.split(' — ')[0] : 'Counter 1';

    const token = localStorage.getItem('pinpoint_token');
    const response = await fetch(API_BASE_URL + '/api/tickets/call-next', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ counter: selectedCounter }) 
    });

    if (response.status === 401) return doLogout();
    if (response.status === 404) return showToast('ℹ️', 'Queue Empty', 'No customers waiting', 'blue');

    const ticket = await response.json();
    S.servingTickets[ticket.counter] = ticket;
    S.queue = S.queue.filter(q => q.number !== ticket.ticketNumber);

    renderStaff(); renderDash(); updateDisps();
    showToast('📢', 'Now Calling', `#${ticket.ticketNumber} to ${selectedCounter}`, 'green');
  } catch (err) { console.error('Failed to call next:', err); }
}

async function completeServing() {
  const myCtr = getMyCounter();
  const currentServing = S.servingTickets[myCtr];
  if (!currentServing || !currentServing._id) return showToast('ℹ️', 'No Active Customer', '', 'blue');
  try {
    const token = localStorage.getItem('pinpoint_token');
    const response = await fetch(`${API_BASE_URL}/api/tickets/complete/${S.servingTickets[getMyCounter()]._id}`, {
      method: 'PUT', headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 401) return doLogout();
    const finishedTicket = await response.json();

    S.servedToday.push(finishedTicket);
    delete S.servingTickets[getMyCounter()];

    // We do NOT call addAct here manually anymore, 
    // because the 'ticket-completed' global socket event will handle it for all clients.
    
    renderDash(); renderStaff(); updateDisps();
    showToast('✅', 'Service Complete', `Ticket ${finishedTicket.ticketNumber} finished`, 'green');
  } catch (err) { showToast('❌', 'Error', 'Failed to save completion', 'red'); }
}

function skipCurrent(){
  const cs = S.servingTickets[getMyCounter()];
  if(!cs){showToast('ℹ️','No Active','—','blue');return;}
  cs.status='skipped';addAct(cs,'Skipped');delete S.servingTickets[getMyCounter()];
  renderDash();renderStaff();updateDisps();showToast('⤭','Skipped','Customer skipped','amber');
}
async function recallCurrent(){
  const cs = S.servingTickets[getMyCounter()];
  if(!cs) return showToast('ℹ️','Nothing to Recall','—','blue');
  
  showToast('📢','Recalling','Sending notification to #'+cs.ticketNumber,'blue');
  
  try {
    const token = localStorage.getItem('pinpoint_token');
    const response = await fetch(`${API_BASE_URL}/api/tickets/recall/${cs._id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 401) return doLogout();
    if (!response.ok) throw new Error('Recall request failed');

    addAct(cs, 'Recalled');
    renderDash();
  } catch (err) {
    console.error('Failed to recall customer:', err);
    showToast('❌', 'Error', 'Could not send recall ping', 'red');
  }
}
function resetQueue(){
  if(!confirm('Reset all queues?'))return;
  S.queue.forEach(q=>{if(q.status==='waiting')q.status='cancelled';});
  S.servingTickets={};
  renderDash();renderStaff();updateDisps();showToast('⊘','Reset','All queues cleared','red');
}
function addAct(e,action){
  const wait=e.issuedAt?Math.round((Date.now()-new Date(e.issuedAt).getTime())/60000):0;
  // Ensure ticket object matching based on backend or socket payload
  const tNum = e.ticketNumber || e.number; 
  const srv = e.serviceType || e.service;
  const ctr = e.counter || 'Unknown';

  // Prevent duplicates
  if(!S.activities.find(a => a.number === tNum && a.action === action)) {
      S.activities.unshift({number:tNum, service:srv, counter:ctr, wait:wait+'m', action, time:new Date().toLocaleTimeString()});
      if(S.activities.length>20)S.activities.pop();
  }
}

// ════════════════════════════════════════════════
// RENDER HELPERS
// ════════════════════════════════════════════════
function goTrack(){if(S.myTicket){document.getElementById('t-inp').value=S.myTicket.number;showPage('track','track');trackQ();}}

function renderDash(){
  const w=getSortedQueue(); 
  const oc=S.counters.filter(c=>c.status==='open').length;
  const avg=w.length?Math.round(w.reduce((a,b)=>a+b.estimatedWait,0)/w.length):0;
  
  document.getElementById('d-stats').innerHTML=[
    {ico:'👥',v:w.length,l:'Waiting Now',cl:'sb',col:'var(--blue-lt)'},
    {ico:'✅',v:S.servedToday.length,l:'Served Today',cl:'sg',col:'var(--green)'},
    {ico:'⏱',v:avg?avg+'m':'—',l:'Avg Wait',cl:'sa',col:'var(--amber)'},
    {ico:'🖥',v:oc+'/'+S.counters.length,l:'Active Counters',cl:'sr',col:'var(--purple)'},
  ].map(s=>`<div class="stat ${s.cl}"><div style="font-size:18px;margin-bottom:8px;">${s.ico}</div>
    <div class="sv" style="color:${s.col};">${s.v}</div><div class="sl">${s.l}</div></div>`).join('');

  const allCalled = Object.values(S.servingTickets).sort((a,b)=> new Date(b.issuedAt) - new Date(a.issuedAt));
  const cs = allCalled[0] || null;
  document.getElementById('d-cur').textContent=cs?cs.ticketNumber:'—';
  document.getElementById('d-cur-svc').innerHTML=cs?(cs.serviceType+' — '+cs.counter + (cs.notes ? '<div style="margin-top:8px;font-style:italic;color:var(--text3);font-size:11px;">Note: '+cs.notes+'</div>' : '')):'No active session';
  document.getElementById('d-ctr').textContent=cs?cs.counter.substring(0,14):'—';
  document.getElementById('d-nxt').textContent=w[0]?w[0].number:'—';

  const pc={Normal:'bb',VIP:'ba','Elderly / Disability':'bg',Emergency:'br'};
  
  document.getElementById('d-qlist').innerHTML=!w.length
    ?'<div style="text-align:center;padding:24px;color:var(--text2);font-size:13px;">Queue is empty</div>'
    :w.slice(0,15).map(q=>{
       const isVIP = q.priority !== 'Normal';
       const borderHighlight = isVIP ? `border-left: 4px solid var(--amber);` : `border-bottom:1px solid var(--border);`;
       const triageContext = q.notes ? `<div style="font-size:11px;color:var(--text3);font-style:italic;margin-top:4px;">"${q.notes.substring(0, 40)}${q.notes.length>40?'...':''}"</div>` : '';
       
       return `<div style="display:flex;align-items:center;gap:10px;padding:8px;background:var(--surface);margin-bottom:6px;border-radius:6px;${borderHighlight}">
        <div style="font-family:var(--fm);font-size:15px;font-weight:700;min-width:46px;color:var(--blue-lt);">${q.number}</div>
        <div style="flex:1;"><div style="font-size:12px;">${q.name}</div><div style="font-size:10px;color:var(--text2);">${q.service}</div>${triageContext}</div>
        <span class="b ${pc[q.priority]||'bb'}">${q.priority}</span>
        <div style="font-size:12px;font-family:var(--fm);color:var(--amber);font-weight:600;">~${q.estimatedWait}m</div>
      </div>`
    }).join('');

  renderCounterGrid('d-ctrs', true);

  const ac={Served:'bg',Skipped:'ba',Cancelled:'br'};
  document.getElementById('d-act').innerHTML=!S.activities.length
    ?`<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:18px;">No recent activity</td></tr>`
    :S.activities.slice(0,10).map(a=>`<tr>
        <td style="font-family:var(--fm);font-weight:600;">${a.number}</td>
        <td>${a.service}</td>
        <td style="font-family:var(--fm);font-size:11px;">${a.counter}</td>
        <td style="font-family:var(--fm);">${a.wait}</td>
        <td><span class="b ${ac[a.action]||'bb'}">${a.action}</span></td>
        <td style="font-family:var(--fm);font-size:11px;color:var(--text2);">${a.time}</td>
      </tr>`).join('');
}

function renderCounterGrid(containerId, allowDelete=false){
  const el=document.getElementById(containerId);if(!el)return;
  const sc={open:'copen',break:'cbreak',closed:''};
  const sl={open:'Open',break:'Break',closed:'Closed'};
  const sco={open:'var(--green)',break:'var(--amber)',closed:'var(--text3)'};
  el.innerHTML=S.counters.map(c=>{
    const svcTkt = S.servingTickets[c.name]; const srv = svcTkt ? svcTkt.ticketNumber : '—';
    const accentBorder=c.status==='open'?`border-color:${c.color}40;box-shadow:0 0 14px ${c.color}15;`:'';
    return `<div class="ccrd ${sc[c.status]||''}" onclick="togCtr(${c.id})" style="${accentBorder}">
      ${allowDelete?`<div class="ccrd-del" onclick="event.stopPropagation();confirmDeleteCounter(${c.id})">✕</div>`:''}
      <div style="width:28px;height:4px;border-radius:2px;background:${c.color||'var(--blue)'};margin:0 auto 10px;"></div>
      <div style="font-size:10px;color:var(--text2);font-family:var(--fm);">${c.name}</div>
      <div style="font-family:var(--fm);font-size:20px;margin:7px 0;color:${c.color||'var(--blue-lt)'};">${srv}</div>
      <div style="font-size:11px;font-weight:700;color:${sco[c.status]}">${sl[c.status]}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px;">${c.operator}</div>
      <div style="font-size:9px;color:var(--text3);margin-top:2px;font-family:var(--fm);">${c.service.split(' ')[0]}</div>
    </div>`;
  }).join('');
}

function togCtr(id){
  const c=S.counters.find(x=>x.id===id);if(!c)return;
  const cy={open:'break',break:'closed',closed:'open'};c.status=cy[c.status];
  renderDash();showToast('🖥',c.name,'Status: '+c.status,'blue');
}
let allOpen=true;
function toggleAll(){
  allOpen=!allOpen;S.counters.forEach(c=>c.status=allOpen?'open':'closed');
  renderDash();showToast(allOpen?'✅':'⊘',allOpen?'All Open':'All Closed','',allOpen?'green':'amber');
}

function renderStaff() {
  const w = getSortedQueue(); 
  document.getElementById('s-cnt').textContent = w.length + ' waiting';

  const curDisplay = document.getElementById('s-cur');
  const svcDisplay = document.getElementById('s-svc');

  const cs = S.servingTickets[getMyCounter()];
  if (cs) {
    curDisplay.textContent = cs.ticketNumber;
    curDisplay.style.color = "var(--blue-lt)";
    const custName = cs.customerName || 'Guest';
    
    const contextHtml = cs.notes 
        ? `<div style="margin-top:12px; background:rgba(255,255,255,0.05); padding:10px; border-radius:6px; font-size:13px; font-style:italic; border-left:3px solid var(--blue-lt); text-align:left;">
            <span style="font-weight:bold; font-style:normal; color:var(--text3); font-size:10px; display:block; margin-bottom:4px;">GUEST NOTES</span>
            "${cs.notes}"
           </div>` 
        : '';
        
    svcDisplay.innerHTML = `<span style="color:#fff;font-size:18px;">${custName}</span> <br/> 
                            <span style="color:var(--text2);">${cs.serviceType}</span>
                            ${contextHtml}`;
  } else {
    curDisplay.textContent = '—';
    svcDisplay.textContent = 'Ready for next customer';
    curDisplay.style.color = "var(--text3)";
  }

  const pc={Normal:'bb',VIP:'ba','Elderly / Disability':'bg',Emergency:'br'};
  document.getElementById('s-tbl').innerHTML=!w.length
    ?`<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:18px;">Queue is empty</td></tr>`
    :w.slice(0,14).map(q=>`<tr>
        <td style="font-family:var(--fm);font-weight:600;color:var(--blue-lt);">${q.number}</td>
        <td>
           <div>${q.name}</div>
           ${q.notes ? `<div style="font-size:10px;color:var(--text3);font-style:italic;">Note: ${q.notes}</div>` : ''}
        </td>
        <td>${q.service}</td>
        <td><span class="b ${pc[q.priority]||'bb'}">${q.priority}</span></td>
        <td style="font-family:var(--fm);color:var(--amber);">${q.estimatedWait}m</td>
        <td><button class="btn bsuc bxs" onclick="callNext()">Call Next</button></td>
      </tr>`).join('');
}

function updStaffStatus(){
  const s=document.getElementById('s-status').value;
  const tp={open:'green',break:'amber',closed:'red'};
  showToast('🖥',{open:'Counter Open ✅',break:'On Break ⏸',closed:'Counter Closed ⊘'}[s],'',tp[s]);
}

function trackQ() {
  const num = document.getElementById('t-inp').value.trim().toUpperCase();
  const res = document.getElementById('t-res'), nf = document.getElementById('t-nf');
  res.style.display = 'none'; nf.style.display = 'none';
  
  const csMatch = Object.values(S.servingTickets).find(x=>x.ticketNumber === num);
  if (csMatch && csMatch.ticketNumber === num) {
    document.getElementById('t-num').textContent = csMatch.ticketNumber;
    document.getElementById('t-svc').textContent = csMatch.serviceType;
    document.getElementById('t-wait').textContent = 'NOW!';
    document.getElementById('t-now').textContent = `Go to ${csMatch.counter}`;
    document.getElementById('t-pos').textContent = 'NOW';
    document.getElementById('t-pos-lbl').textContent = "You're being served!";
    document.getElementById('t-ring').className = 'tring now';
    document.getElementById('t-prog').style.width = '100%';
    document.getElementById('t-pct').textContent = '100% complete';
    res.style.display = 'block';
    return;
  }

  const w = getSortedQueue();
  const e = w.find(q => q.number === num);
  
  if (!e) { nf.style.display = 'block'; return; }

  const pos = w.indexOf(e) + 1;
  document.getElementById('t-num').textContent = e.number;
  document.getElementById('t-svc').textContent = e.service;
  document.getElementById('t-wait').textContent = e.estimatedWait + 'm';
  
  document.getElementById('t-pos').textContent = pos;
  document.getElementById('t-pos-lbl').textContent = 'Position in queue';
  document.getElementById('t-ring').className = 'tring';
  
  const pct = Math.min(100, Math.max(5, Math.round(((w.length - pos + 1) / w.length) * 100)));
  document.getElementById('t-prog').style.width = pct + '%';
  document.getElementById('t-pct').textContent = pct + '% complete';
  
  res.style.display = 'block';
}

function updateDisps(){
  const allCalled = Object.values(S.servingTickets).sort((a,b)=> new Date(b.issuedAt) - new Date(a.issuedAt));
  const cs = allCalled[0] || null;
  const w=getSortedQueue(),nxt=w[0];
  const avg=w.length?Math.round(w.reduce((a,b)=>a+b.estimatedWait,0)/w.length):0;
  const sco={open:'var(--green)',break:'var(--amber)',closed:'var(--text3)'};
  const tks=S.counters.map(c=>`<div class="dchip" style="border-color:${sco[c.status]};color:${sco[c.status]};">${c.name} — ${c.status.charAt(0).toUpperCase()+c.status.slice(1)}</div>`).join('');
  const d=id=>document.getElementById(id);
  
  if(d('d-now'))d('d-now').textContent=cs?cs.ticketNumber:'—';
  if(d('d-svc2'))d('d-svc2').textContent=cs?cs.serviceType:'No active session';
  if(d('d-ctrlbl'))d('d-ctrlbl').textContent=cs?cs.counter:'';
  if(d('d-nxt2'))d('d-nxt2').textContent=nxt?nxt.number:'—';
  if(d('d-wt'))d('d-wt').textContent=w.length;
  if(d('d-avg'))d('d-avg').textContent=avg?avg+'m':'—';
  if(d('d-tks'))d('d-tks').innerHTML=tks;
  if(d('pub-now'))d('pub-now').textContent=cs?cs.ticketNumber:'';
  if(d('pub-svc'))d('pub-svc').textContent=cs?`${cs.serviceType} — Go to ${cs.counter}`:'';
  if(d('pub-nxt'))d('pub-nxt').textContent=nxt?nxt.number:'—';
  if(d('pub-wt'))d('pub-wt').textContent=w.length;
  if(d('pub-tks'))d('pub-tks').innerHTML=tks;
}

// ════════════════════════════════════════════════
// ANALYTICS & SERVICES
// ════════════════════════════════════════════════
let trafficChartInstance = null;
let serviceChartInstance = null;

async function renderAnalytics() {
  try {
    const token = localStorage.getItem('pinpoint_token');
    const response = await fetch(API_BASE_URL + '/api/tickets/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 401) {
       showToast('❌', 'Unauthorized', 'Session expired. Please log in again.', 'red');
       return;
    }

    const stats = await response.json();

    document.getElementById('an-sts').innerHTML = `
      <div class="stat"><div class="sv" style="color:var(--blue-lt);">${stats.waitingNow}</div><div class="sl">Waiting Now</div></div>
      <div class="stat"><div class="sv" style="color:var(--green);">${stats.totalServed}</div><div class="sl">Served Today</div></div>
      <div class="stat"><div class="sv" style="color:var(--amber);">${stats.avgWaitTime}</div><div class="sl">Avg Wait Time</div></div>
      <div class="stat"><div class="sv" style="color:var(--purple);">${stats.totalServed + stats.waitingNow}</div><div class="sl">Total Tickets Issued</div></div>
    `;

    const serviceLabels = stats.serviceBreakdown.map(s => s._id);
    const serviceData = stats.serviceBreakdown.map(s => s.count);

    const ctxService = document.getElementById('serviceChart');
    if (serviceChartInstance) serviceChartInstance.destroy(); 
    
    serviceChartInstance = new Chart(ctxService, {
        type: 'doughnut',
        data: {
            labels: serviceLabels.length > 0 ? serviceLabels : ['No Data Yet'],
            datasets: [{
                data: serviceData.length > 0 ? serviceData : [1],
                backgroundColor: ['#388BFD', '#3FB950', '#E3B341', '#A78BFA', '#F85149', '#39D353'],
                borderWidth: 0 
            }]
        },
        options: { 
            plugins: { legend: { position: 'right', labels: { color: '#8b949e', font: { family: 'Figtree' } } } }, 
            cutout: '75%' 
        }
    });

    const ctxTraffic = document.getElementById('trafficChart');
    if (trafficChartInstance) trafficChartInstance.destroy();
    
    trafficChartInstance = new Chart(ctxTraffic, {
        type: 'bar',
        data: {
            labels: ['8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM'],
            datasets: [{
                label: 'Clients Arrived',
                data: [4, 12, 18, stats.totalServed + 2, stats.waitingNow + 5, 8, 3], 
                backgroundColor: '#388BFD',
                borderRadius: 6
            }]
        },
        options: {
            scales: {
                y: { beginAtZero: true, grid: { color: '#30363d' }, ticks: { color: '#8b949e' } },
                x: { grid: { display: false }, ticks: { color: '#8b949e' } }
            },
            plugins: { legend: { display: false } } 
        }
    });

  } catch (err) {
    console.error('Analytics Fetch Error:', err);
  }
}

function renderSvcs(){
  const cg=document.getElementById('svc-counter-grid');
  const sco={open:'var(--green)',break:'var(--amber)',closed:'var(--text3)'};
  const sl={open:'Open',break:'Break',closed:'Closed'};
  const sbadge={open:'bg',break:'ba',closed:'br'};
  
  if(cg) {
    cg.innerHTML=S.counters.map(c=>`
      <div class="card csm" style="border-left:3px solid ${c.color||'var(--blue)'};transition:all 0.2s;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
          <div>
            <div style="font-weight:700;font-size:14px;">${c.name}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:2px;">${c.service}</div>
          </div>
          <span class="b ${sbadge[c.status]||'bb'}">${sl[c.status]}</span>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:12px;">👤 ${c.operator}</div>
        <div style="display:flex;gap:6px;">
          <button class="btn bghost bxs" style="flex:1;" onclick="openEditCounter(${c.id})">✏️ Edit</button>
          <button class="btn bxs" style="background:var(--red-dim);color:var(--red);border:1px solid var(--red-bdr);" onclick="confirmDeleteCounter(${c.id})">🗑</button>
          <button class="btn bxs bghost" onclick="togCtr(${c.id})">⇄</button>
        </div>
      </div>`).join('');
  }

  const sGrid = document.getElementById('svc-grid');
  if(sGrid) {
    sGrid.innerHTML=SVCS.map(s=>{
      const cnt=S.queue.filter(q=>q.service===s&&q.status==='waiting').length;
      return `<div class="card csm">
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:9px;">
          <span style="font-size:20px;">${ICOS[s]}</span>
          <div><div style="font-weight:600;font-size:13px;">${s}</div><div style="font-size:10px;color:var(--text2);font-family:var(--fm);">Prefix: ${PFX[s]}</div></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:7px;">
          <span style="color:var(--text2);">In queue</span><span style="font-family:var(--fm);color:var(--blue-lt);font-weight:600;">${cnt}</span>
        </div><div class="pw"><div class="pb" style="width:${Math.min(100,cnt*12)}%;"></div></div>
      </div>`;
    }).join('');
  }

  const ctrTbl = document.getElementById('ctr-tbl');
  if(ctrTbl) {
    ctrTbl.innerHTML=S.counters.map(c=>`<tr>
      <td style="font-weight:600;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c.color||'var(--blue)'};margin-right:7px;vertical-align:middle;"></span>${c.name}</td>
      <td>${c.service}</td><td>${c.operator}</td>
      <td><span class="b ${sbadge[c.status]||'bb'}">${sl[c.status]}</span></td>
      <td><button class="btn bghost bxs" onclick="openEditCounter(${c.id})">✏️ Edit</button></td>
      <td><button class="btn bxs" style="background:var(--red-dim);color:var(--red);border:1px solid var(--red-bdr);" onclick="confirmDeleteCounter(${c.id})">🗑 Remove</button></td>
    </tr>`).join('');
  }
}

// ════════════════════════════════════════════════
// COUNTER MODAL ACTIONS
// ════════════════════════════════════════════════
function openAddCounter(){
  S.editingCtrId=null;S.selectedColor='#388BFD';
  document.getElementById('modal-title').textContent='Add New Counter';
  document.getElementById('modal-save-btn').textContent='＋ Add Counter';
  document.getElementById('m-name').value='Counter '+(S.nextCtrId);
  document.getElementById('m-operator').value='';
  document.getElementById('m-status').value='open';
  document.getElementById('m-service').value='Customer Service';
  setPickedColor('#388BFD');
  document.getElementById('counter-modal').classList.add('open');
}
function openEditCounter(id){
  const c=S.counters.find(x=>x.id===id);if(!c)return;
  S.editingCtrId=id;S.selectedColor=c.color||'#388BFD';
  document.getElementById('modal-title').textContent='Edit Counter';
  document.getElementById('modal-save-btn').textContent='Save Changes';
  document.getElementById('m-name').value=c.name;
  document.getElementById('m-operator').value=c.operator;
  document.getElementById('m-status').value=c.status;
  document.getElementById('m-service').value=c.service;
  setPickedColor(c.color||'#388BFD');
  document.getElementById('counter-modal').classList.add('open');
}
function closeCounterModal(){document.getElementById('counter-modal').classList.remove('open');}

function pickColor(el){ setPickedColor(el.getAttribute('data-c')); }
function setPickedColor(col){
  S.selectedColor=col;
  document.querySelectorAll('.color-opt').forEach(el=>{
    el.style.borderColor=el.getAttribute('data-c')===col?'#fff':'transparent';
    el.style.transform=el.getAttribute('data-c')===col?'scale(1.25)':'scale(1)';
  });
}

function saveCounter(){
  const name=document.getElementById('m-name').value.trim();
  const service=document.getElementById('m-service').value;
  const operator=document.getElementById('m-operator').value.trim()||'Unassigned';
  const status=document.getElementById('m-status').value;
  const color=S.selectedColor||'#388BFD';
  if(!name){showToast('⚠️','Missing Name','Enter a counter name','amber');return;}

  if(S.editingCtrId){
    const c=S.counters.find(x=>x.id===S.editingCtrId);
    if(c){c.name=name;c.service=service;c.operator=operator;c.status=status;c.color=color;}
    showToast('✏️','Counter Updated',`${name} saved`,'blue');
  } else {
    S.counters.push({id:S.nextCtrId++,name,service,operator,status,color});
    showToast('✅','Counter Added',`${name} is now active`,'green');
  }
  closeCounterModal(); populateStaffCounterSelect(); renderDash();renderSvcs();updateDisps();
}

let _deleteTargetId=null;
function confirmDeleteCounter(id){
  _deleteTargetId=id;
  const c=S.counters.find(x=>x.id===id);
  document.getElementById('confirm-title').textContent='Remove '+( c?c.name:'Counter')+'?';
  document.getElementById('confirm-msg').textContent='This will remove the counter and cannot be undone.';
  document.getElementById('confirm-ok-btn').onclick=()=>doDeleteCounter(_deleteTargetId);
  document.getElementById('confirm-modal').classList.add('open');
}
function closeConfirm(){document.getElementById('confirm-modal').classList.remove('open');}
function doDeleteCounter(id){
  
  S.counters=S.counters.filter(x=>x.id!==id);
  closeConfirm(); populateStaffCounterSelect(); renderDash();renderSvcs();updateDisps();
  showToast('🗑','Counter Removed','Counter deleted successfully','red');
}

// ════════════════════════════════════════════════
// MISCELLANEOUS
// ════════════════════════════════════════════════
function mkQR(str){
  let h=0;for(let i=0;i<str.length;i++)h=((h<<5)-h)+str.charCodeAt(i);
  let cells='';
  for(let r=0;r<7;r++)for(let c=0;c<7;c++){
    const brd=(r<2&&c<2)||(r<2&&c>4)||(r>4&&c<2);
    const on=brd?true:(((h^(r*7+c)*31)>>>0)%3!==0);
    cells+=`<div class="qrc" style="background:${on?'#0d1117':'#fff'};"></div>`;
  }
  return `<div class="qr">${cells}</div>`;
}

function showToast(ico,title,msg,type='blue'){
  const t=document.getElementById('toast');
  const cm={green:'var(--green-dim)',blue:'var(--blue-dim)',amber:'var(--amber-dim)',red:'var(--red-dim)'};
  document.getElementById('t-ico').style.background=cm[type]||'var(--blue-dim)';
  document.getElementById('t-ico').textContent=ico;
  document.getElementById('t-tt').textContent=title;
  document.getElementById('t-tm').textContent=msg;
  t.classList.add('show');clearTimeout(t._t);
  t._t=setTimeout(()=>t.classList.remove('show'),3000);
}

// ════════════════════════════════════════════════
// 🛑 INACTIVITY SCREENSAVER LOGIC (REPLACES OLD TIMEOUT)
// ════════════════════════════════════════════════
let idleTimer;
const IDLE_TIME_LIMIT = 60000; // 60 seconds

function resetIdleTimer() {
    clearTimeout(idleTimer);
    
    const screensaver = document.getElementById('guest-screensaver');
    
    // Hide screensaver if it is currently visible
    if (screensaver && screensaver.style.display === 'flex') {
        screensaver.style.opacity = '0';
        setTimeout(() => { 
            screensaver.style.display = 'none'; 
        }, 500); 
    }
    
    // Only restart the timer if the user is a customer/guest (NOT admin/staff)
    // AND if we are not sitting on the login screen
    const loginScreen = document.getElementById('login-screen');
    if ((!S.role || S.role === 'customer') && loginScreen && loginScreen.style.display !== 'flex') {
        idleTimer = setTimeout(showScreensaver, IDLE_TIME_LIMIT);
    }
}

function showScreensaver() {
    const screensaver = document.getElementById('guest-screensaver');
    if (screensaver) {
      screensaver.style.display = 'flex';
      setTimeout(() => { 
          screensaver.style.opacity = '1'; 
      }, 10);
    }
}

['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll', 'click'].forEach(evt => {
    document.addEventListener(evt, resetIdleTimer, true);
});

// Start the timer on initial load
resetIdleTimer();

// ════════════════════════════════════════════════
// MOBILE FIXES
// ════════════════════════════════════════════════
function applyMobileFixes() {
  const style = document.createElement('style');
  style.innerHTML = `
    @media (max-width: 768px) {
      #app { flex-direction: column !important; }
      aside { position: fixed; top: 0; left: -300px; height: 100vh; width: 280px; z-index: 9999; transition: left 0.3s ease; box-shadow: 5px 0 15px rgba(0,0,0,0.5); }
      aside.open { left: 0; }
      #mobile-nav-backdrop { position: fixed; inset: 0; background: rgba(4, 10, 18, 0.56); opacity: 0; pointer-events: none; transition: opacity 0.25s ease; z-index: 9998; }
      #mobile-nav-backdrop.open { opacity: 1; pointer-events: auto; }
      .nsec { display: block !important; }
      .ni span:not(.ni-ico), .lout span:not(:first-child), #theme-label { display: inline !important; }
      .stat-grid, #svc-btns, #d-ctrs { grid-template-columns: 1fr !important; gap: 10px; }
      .page, .card { padding: 15px !important; }
      .jumbo-text { font-size: 3rem !important; }
    }
  `;
  document.head.appendChild(style);
}
applyMobileFixes();

async function skipCurrent() {
  const currentServing = S.servingTickets[getMyCounter()];
  if (!currentServing || !currentServing._id) {
    showToast('ℹ️', 'No Active', '—', 'blue');
    return;
  }

  try {
    const token = localStorage.getItem('pinpoint_token');
    const response = await fetch(`${API_BASE_URL}/api/tickets/skip/${currentServing._id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 401) return doLogout();
    if (!response.ok) throw new Error('Skip request failed');

    const skippedTicket = await response.json();
    addAct(skippedTicket, 'Skipped');
    delete S.servingTickets[getMyCounter()];
    renderDash(); renderStaff(); updateDisps();
    showToast('⤭', 'Dropped Off', `Ticket ${skippedTicket.ticketNumber} left the queue`, 'amber');
  } catch (err) {
    console.error('Failed to skip customer:', err);
    showToast('❌', 'Error', 'Could not mark customer as dropped off', 'red');
  }
}

async function renderAnalytics() {
  try {
    const token = localStorage.getItem('pinpoint_token');
    const response = await fetch(API_BASE_URL + '/api/tickets/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 401) {
      showToast('❌', 'Unauthorized', 'Session expired. Please log in again.', 'red');
      return;
    }

    const stats = await response.json();

    document.getElementById('an-sts').innerHTML = `
      <div class="stat"><div class="sv" style="color:var(--blue-lt);">${stats.peakHour ? stats.peakHour.label : 'No data'}</div><div class="sl">Peak Hour</div></div>
      <div class="stat"><div class="sv" style="color:var(--green);">${stats.totalServed}</div><div class="sl">Served Today</div></div>
      <div class="stat"><div class="sv" style="color:var(--amber);">${stats.avgWaitTime}</div><div class="sl">Avg Wait Time</div></div>
      <div class="stat"><div class="sv" style="color:var(--purple);">${stats.dropOffRate}%</div><div class="sl">Drop-off Rate</div></div>
    `;

    const peakInsight = document.getElementById('an-peak');
    if (peakInsight) {
      peakInsight.innerHTML = stats.peakHour
        ? `<strong style="color:var(--text);">${stats.peakHour.label}</strong> was the busiest period with <strong style="color:var(--blue-lt);">${stats.peakHour.count}</strong> tickets issued.`
        : 'No traffic pattern yet for today.';
    }

    const recommendation = document.getElementById('an-rec');
    if (recommendation) {
      recommendation.textContent = stats.dropOffRate >= 20
        ? 'Drop-off is high. Add support during peak periods or reduce customer uncertainty with faster queue progression.'
        : stats.avgWaitMinutes >= 15
          ? 'Average wait time is climbing. Consider reallocating staff to the busiest counter.'
          : 'Queue health looks stable. Current staffing is handling demand well.';
    }

    const serviceLabels = stats.serviceBreakdown.map(s => s._id);
    const serviceData = stats.serviceBreakdown.map(s => s.count);
    const ctxService = document.getElementById('serviceChart');
    if (serviceChartInstance) serviceChartInstance.destroy();

    serviceChartInstance = new Chart(ctxService, {
      type: 'doughnut',
      data: {
        labels: serviceLabels.length ? serviceLabels : ['No Data Yet'],
        datasets: [{
          data: serviceData.length ? serviceData : [1],
          backgroundColor: ['#388BFD', '#3FB950', '#E3B341', '#A78BFA', '#F85149', '#39D353'],
          borderWidth: 0
        }]
      },
      options: {
        plugins: { legend: { position: 'right', labels: { color: '#8b949e', font: { family: 'Figtree' } } } },
        cutout: '75%'
      }
    });

    const ctxTraffic = document.getElementById('trafficChart');
    if (trafficChartInstance) trafficChartInstance.destroy();

    trafficChartInstance = new Chart(ctxTraffic, {
      type: 'bar',
      data: {
        labels: stats.hourlyTraffic.length ? stats.hourlyTraffic.map(h => h.label) : ['No Data'],
        datasets: [{
          label: 'Clients Arrived',
          data: stats.hourlyTraffic.length ? stats.hourlyTraffic.map(h => h.count) : [0],
          backgroundColor: '#388BFD',
          borderRadius: 6
        }]
      },
      options: {
        scales: {
          y: { beginAtZero: true, grid: { color: '#30363d' }, ticks: { color: '#8b949e' } },
          x: { grid: { display: false }, ticks: { color: '#8b949e' } }
        },
        plugins: { legend: { display: false } }
      }
    });

    const perfTable = document.getElementById('an-ctrs');
    if (perfTable) {
      const bestServed = Math.max(1, ...stats.staffPerformance.map(s => s.servedCount));
      perfTable.innerHTML = stats.staffPerformance.length
        ? stats.staffPerformance.map((staff) => {
            const matchedCounter = S.counters.find(counter => counter.name === staff.counter);
            const operatorName = matchedCounter ? matchedCounter.operator : 'Unassigned';
            const efficiency = Math.round((staff.servedCount / bestServed) * 100);
            const healthClass = efficiency >= 80 ? 'bg' : efficiency >= 50 ? 'bb' : 'ba';
            const healthLabel = efficiency >= 80 ? 'High' : efficiency >= 50 ? 'Moderate' : 'Needs Support';
            return `<tr>
              <td>${staff.counter}</td>
              <td>${operatorName}</td>
              <td>${staff.servedCount}</td>
              <td>${staff.avgHandleMinutes}m</td>
              <td>${efficiency}%</td>
              <td><span class="b ${healthClass}">${healthLabel}</span></td>
            </tr>`;
          }).join('')
        : `<tr><td colspan="6" style="text-align:center;color:var(--text2);">No staff performance data yet.</td></tr>`;
    }
  } catch (err) {
    console.error('Analytics Fetch Error:', err);
  }
}


async function renderHistory() {
  const tbody = document.getElementById('history-tbl');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;">Loading history...</td></tr>';

  try {
    const token = localStorage.getItem('pinpoint_token');
    const res = await fetch(API_BASE_URL + '/api/tickets/history', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) return doLogout();
    const data = await res.json();

    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3);">No completed or skipped tickets today.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(t => {
      const waitTime = t.completedAt && t.issuedAt 
          ? Math.round((new Date(t.completedAt) - new Date(t.issuedAt))/60000) 
          : (t.skippedAt && t.issuedAt ? Math.round((new Date(t.skippedAt) - new Date(t.issuedAt))/60000) : '-');
      
      const statusColor = t.status === 'Completed' ? 'var(--green)' : 'var(--amber)';
      const actionTime = new Date(t.completedAt || t.skippedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const badge = `<span class="b" style="border:1px solid ${statusColor}; color:${statusColor};">${t.status.toUpperCase()}</span>`;
      const timeStr = t.issuedAt ? new Date(t.issuedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '-';

      return `<tr>
        <td style="font-family:var(--fm); font-weight:600;">${t.ticketNumber}</td>
        <td>${t.customerName || 'Guest'}${t.notes ? `<div style="font-size:10px;color:var(--text3);font-style:italic;">Note: ${t.notes}</div>` : ''}</td>
        <td>${t.serviceType}</td>
        <td>${timeStr}</td>
        <td>${waitTime}m</td>
        <td>${badge} <span style="font-size:11px;color:var(--text3);margin-left:5px;">@ ${actionTime}</span></td>
        <td>${t.counter || '-'}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--red);">Failed to load history data</td></tr>';
  }
}
