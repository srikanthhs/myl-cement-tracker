'use strict';
/**
 * Static user registry – mirrors the original app's USERS array.
 * In production this would live in Firestore; keeping it in-process
 * lets the app work without a Firestore connection.
 *
 * Passwords will be bcrypt-hashed at first startup if USE_HASHED_PASSWORDS=true.
 * For now plain-text comparison is used (dev mode).
 */

const USERS = [
  // ── District Level ─────────────────────────────────────────────────────────
  { id:'U001', username:'collector', password:'admin2025',
    role:'admin', block:null, panchayats:null,
    name:'District Collector', designation:'District Collector, Mayiladuthurai',
    dept:'Collectorate, Mayiladuthurai', mobile:'9400000001',
    avatarColor:'admin', icon:'admin_panel_settings' },

  // ── Mayiladuthurai Block ────────────────────────────────────────────────────
  { id:'U101', username:'bdo.myl', password:'bdo.myl2025',
    role:'bdo', block:'Mayiladuthurai', panchayats:null,
    name:'S. Ravikumar', designation:'BDO – Mayiladuthurai Block',
    dept:'Block Development Office, Mayiladuthurai', mobile:'9400001001',
    avatarColor:'bdo', icon:'account_balance' },
  { id:'U103', username:'store.myl', password:'store.myl2025',
    role:'store', block:'Mayiladuthurai', panchayats:null,
    name:'P. Murugesan', designation:'Store Keeper – Mayiladuthurai Depot',
    dept:'Rural Development Dept, Mayiladuthurai', mobile:'9400001003',
    avatarColor:'store', icon:'warehouse' },
  { id:'U104', username:'inspector.myl', password:'insp.myl2025',
    role:'inspector', block:'Mayiladuthurai', panchayats:null,
    name:'M. Selvaraj', designation:'Field Inspector – Mayiladuthurai',
    dept:'Rural Development Dept, Mayiladuthurai', mobile:'9400001004',
    avatarColor:'inspector', icon:'fact_check' },
  { id:'U105', username:'engineer.myl', password:'eng.myl2025',
    role:'engineer', block:'Mayiladuthurai', panchayats:null,
    name:'K. Arumugam', designation:'AE/JE – Mayiladuthurai Block',
    dept:'Rural Development Dept, Mayiladuthurai', mobile:'9400001005',
    avatarColor:'inspector', icon:'engineering' },

  // Mayiladuthurai Overseers
  { id:'MYL-OV1', username:'r.kayalvizhi', password:'kayalvizhi2025',
    role:'overseer', block:'Mayiladuthurai',
    panchayats:['AGARAKEERANGUDI','ANAIMELAGARAM','MARAIYUR','MAYILADUTHURAI RURAL','MOOVALUR','NALLATHUKUDI','PATTAMANGALAM','SOLAMPETTAI','SITHARKADU'],
    name:'R.Kayalvizhi', designation:'Works Overseer – Mayiladuthurai',
    dept:'Rural Development Dept, Mayiladuthurai', mobile:'',
    avatarColor:'overseer', icon:'engineering' },
  { id:'MYL-OV2', username:'k.oosainayagi', password:'oosainayagi2025',
    role:'overseer', block:'Mayiladuthurai',
    panchayats:['ANATHANDAVAPURAM','KADAKKAM','KADUVANGUDI','KEELAMARUTHANTHANALLUR','KIZHAI','KURICHI','MUDIKANDANALLUR','SITHAMALLI','VILLIYANALLUR'],
    name:'K.Oosainayagi', designation:'Works Overseer – Mayiladuthurai',
    dept:'Rural Development Dept, Mayiladuthurai', mobile:'',
    avatarColor:'overseer', icon:'engineering' },
  { id:'MYL-OV3', username:'g.tamilselvi', password:'tamilselvi2025',
    role:'overseer', block:'Mayiladuthurai',
    panchayats:['ARUNMOZHIDEVAN','IVANALLUR','KANGANAMPUTHUR','KESINGAN','NEEDUR','PANDUR','PONNUR','THALANCHERY','THIRUENTHALUR'],
    name:'G.Tamilselvi', designation:'Works Overseer – Mayiladuthurai',
    dept:'Rural Development Dept, Mayiladuthurai', mobile:'',
    avatarColor:'overseer', icon:'engineering' },
  { id:'MYL-OV4', username:'k.praveen', password:'praveen2025',
    role:'overseer', block:'Mayiladuthurai',
    panchayats:['ARUVAPADI','ELANTHOPPU','KORKAI','MAHARAJAPURAM','MAPPADUGAI','MELANALLUR','PATTAVARTHI','SETHUR','THALAINAYAR'],
    name:'K.Praveen', designation:'Works Overseer – Mayiladuthurai',
    dept:'Rural Development Dept, Mayiladuthurai', mobile:'',
    avatarColor:'overseer', icon:'engineering' },
  { id:'MYL-OV5', username:'r.anbazhagan', password:'anbazhagan2025',
    role:'overseer', block:'Mayiladuthurai',
    panchayats:['AATHUR','BOOTHANGUDI','KADALANGUDI','KALI','MURUGAMANGALAM','NAMASIVAYAPURAM','THIRUCHITRAMPALAM','THIRUMANGALAM','VARADHAMPATTU'],
    name:'R.Anbazhagan', designation:'Works Overseer – Mayiladuthurai',
    dept:'Rural Development Dept, Mayiladuthurai', mobile:'',
    avatarColor:'overseer', icon:'engineering' },
  { id:'MYL-OV6', username:'d.praveena', password:'praveena2025',
    role:'overseer', block:'Mayiladuthurai',
    panchayats:['DHARMATHANAPURAM','KODANGUDI','KULICHAR','MANAKUDI','MANNAMPANDAL','MOZHAIYUR','SERUTHIYUR','ULUTHUKUPPAI','VALLALAGARAM'],
    name:'D.Praveena', designation:'Works Overseer – Mayiladuthurai',
    dept:'Rural Development Dept, Mayiladuthurai', mobile:'',
    avatarColor:'overseer', icon:'engineering' },

  // ── Sirkali Block ──────────────────────────────────────────────────────────
  { id:'U201', username:'bdo.skz', password:'bdo.skz2025',
    role:'bdo', block:'Sirkali', panchayats:null,
    name:'R. Ganesh', designation:'BDO – Sirkali Block',
    dept:'Block Development Office, Sirkali', mobile:'9400002001',
    avatarColor:'bdo', icon:'account_balance' },
  { id:'U203', username:'store.skz', password:'store.skz2025',
    role:'store', block:'Sirkali', panchayats:null,
    name:'A. Rajan', designation:'Store Keeper – Sirkali Depot',
    dept:'Rural Development Dept, Sirkali', mobile:'9400002003',
    avatarColor:'store', icon:'warehouse' },
  { id:'U204', username:'inspector.skz', password:'insp.skz2025',
    role:'inspector', block:'Sirkali', panchayats:null,
    name:'D. Lakshmi', designation:'Field Inspector – Sirkali',
    dept:'Rural Development Dept, Sirkali', mobile:'9400002004',
    avatarColor:'inspector', icon:'fact_check' },
  { id:'U205', username:'engineer.skz', password:'eng.skz2025',
    role:'engineer', block:'Sirkali', panchayats:null,
    name:'P. Suresh', designation:'AE/JE – Sirkali Block',
    dept:'Rural Development Dept, Sirkali', mobile:'9400002005',
    avatarColor:'inspector', icon:'engineering' },

  // ── Sembanarkoil Block ────────────────────────────────────────────────────
  { id:'U301', username:'bdo.sbn', password:'bdo.sbn2025',
    role:'bdo', block:'Sembanarkoil', panchayats:null,
    name:'V. Suresh', designation:'BDO – Sembanarkoil Block',
    dept:'Block Development Office, Sembanarkoil', mobile:'9400003001',
    avatarColor:'bdo', icon:'account_balance' },
  { id:'U303', username:'store.sbn', password:'store.sbn2025',
    role:'store', block:'Sembanarkoil', panchayats:null,
    name:'B. Mani', designation:'Store Keeper – Sembanarkoil Depot',
    dept:'Rural Development Dept, Sembanarkoil', mobile:'9400003003',
    avatarColor:'store', icon:'warehouse' },
  { id:'U304', username:'inspector.sbn', password:'insp.sbn2025',
    role:'inspector', block:'Sembanarkoil', panchayats:null,
    name:'C. Devika', designation:'Field Inspector – Sembanarkoil',
    dept:'Rural Development Dept, Sembanarkoil', mobile:'9400003004',
    avatarColor:'inspector', icon:'fact_check' },
  { id:'U305', username:'engineer.sbn', password:'eng.sbn2025',
    role:'engineer', block:'Sembanarkoil', panchayats:null,
    name:'R. Mani', designation:'AE/JE – Sembanarkoil Block',
    dept:'Rural Development Dept, Sembanarkoil', mobile:'9400003005',
    avatarColor:'inspector', icon:'engineering' },

  // ── Kuthalam Block ────────────────────────────────────────────────────────
  { id:'U401', username:'bdo.ktl', password:'bdo.ktl2025',
    role:'bdo', block:'Kuthalam', panchayats:null,
    name:'G. Pandi', designation:'BDO – Kuthalam Block',
    dept:'Block Development Office, Kuthalam', mobile:'9400004001',
    avatarColor:'bdo', icon:'account_balance' },
  { id:'U403', username:'store.ktl', password:'store.ktl2025',
    role:'store', block:'Kuthalam', panchayats:null,
    name:'J. Arumugam', designation:'Store Keeper – Kuthalam Depot',
    dept:'Rural Development Dept, Kuthalam', mobile:'9400004003',
    avatarColor:'store', icon:'warehouse' },
  { id:'U404', username:'inspector.ktl', password:'insp.ktl2025',
    role:'inspector', block:'Kuthalam', panchayats:null,
    name:'F. Kamala', designation:'Field Inspector – Kuthalam',
    dept:'Rural Development Dept, Kuthalam', mobile:'9400004004',
    avatarColor:'inspector', icon:'fact_check' },
  { id:'U405', username:'engineer.ktl', password:'eng.ktl2025',
    role:'engineer', block:'Kuthalam', panchayats:null,
    name:'G. Balan', designation:'AE/JE – Kuthalam Block',
    dept:'Rural Development Dept, Kuthalam', mobile:'9400004005',
    avatarColor:'inspector', icon:'engineering' },

  // ── Papanasam Block ───────────────────────────────────────────────────────
  { id:'U501', username:'bdo.ppn', password:'bdo.ppn2025',
    role:'bdo', block:'Papanasam', panchayats:null,
    name:'T. Sundaram', designation:'BDO – Papanasam Block',
    dept:'Block Development Office, Papanasam', mobile:'9400005001',
    avatarColor:'bdo', icon:'account_balance' },
  { id:'U503', username:'store.ppn', password:'store.ppn2025',
    role:'store', block:'Papanasam', panchayats:null,
    name:'K. Muthukrishnan', designation:'Store Keeper – Papanasam Depot',
    dept:'Rural Development Dept, Papanasam', mobile:'9400005003',
    avatarColor:'store', icon:'warehouse' },
  { id:'U505', username:'engineer.ppn', password:'eng.ppn2025',
    role:'engineer', block:'Papanasam', panchayats:null,
    name:'S. Kannan', designation:'AE/JE – Papanasam Block',
    dept:'Rural Development Dept, Papanasam', mobile:'9400005005',
    avatarColor:'inspector', icon:'engineering' },
];

function findByCredentials(username, password) {
  return USERS.find(u => u.username === username && u.password === password) || null;
}

function findById(id) {
  return USERS.find(u => u.id === id) || null;
}

function findByUsername(username) {
  return USERS.find(u => u.username === username) || null;
}

function safeUser(u) {
  if (!u) return null;
  const { password, ...safe } = u;
  return safe;
}

module.exports = { USERS, findByCredentials, findById, findByUsername, safeUser };
