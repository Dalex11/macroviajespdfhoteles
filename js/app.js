/* =========================================================================
   MacroViajes - Generador de documentos de reserva
   ========================================================================= */

const LS_HOTELS = 'mv_hotels_v1';
const LS_ITIN   = 'mv_itin_v1';

let HOTELS = [];
let ITIN   = {};

/* ---------------------------------------------------------------------- */
/* Bootstrap                                                              */
/* ---------------------------------------------------------------------- */
async function loadData(){
  const lsHotels = localStorage.getItem(LS_HOTELS);
  const lsItin   = localStorage.getItem(LS_ITIN);

  if(lsHotels){ HOTELS = JSON.parse(lsHotels); }
  else{
    try{ HOTELS = await (await fetch('data/hotels.json')).json(); }
    catch(e){ HOTELS = []; }
  }

  if(lsItin){ ITIN = JSON.parse(lsItin); }
  else{
    try{ ITIN = await (await fetch('data/itinerarios.json')).json(); }
    catch(e){ ITIN = {}; }
  }
  saveHotels(); saveItin();
}

function saveHotels(){ localStorage.setItem(LS_HOTELS, JSON.stringify(HOTELS)); }
function saveItin(){ localStorage.setItem(LS_ITIN, JSON.stringify(ITIN)); }

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.remove('show'), 2200);
}

/* ---------------------------------------------------------------------- */
/* Text helpers                                                           */
/* ---------------------------------------------------------------------- */
function titleCase(str){
  if(!str) return '';
  return str.toLowerCase().replace(/(^|\s|-|\/)([a-záéíóúñü])/g, (m,p1,p2)=> p1+p2.toUpperCase());
}
function upper(str){ return (str||'').toUpperCase(); }

const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function parseDate(iso){
  // iso: yyyy-mm-dd  -> local Date at noon to avoid TZ shift issues
  const [y,m,d] = iso.split('-').map(Number);
  return new Date(y, m-1, d, 12,0,0);
}
function addDays(date, n){
  const d = new Date(date);
  d.setDate(d.getDate()+n);
  return d;
}
function fmtLongDate(date){
  return `${DIAS[date.getDay()]}, ${String(date.getDate()).padStart(2,'0')} de ${MESES[date.getMonth()]} de ${date.getFullYear()}`;
}
function fmtShortDate(date){
  return `${String(date.getDate()).padStart(2,'0')} DE ${MESES[date.getMonth()].toUpperCase()}`;
}
function nightsBetween(inDate, outDate){
  return Math.round((outDate-inDate)/(1000*60*60*24));
}
function randomConfirmation(len=10){
  let s='';
  for(let i=0;i<len;i++) s += Math.floor(Math.random()*10);
  return s;
}
function mdBold(text){
  return (text||'').replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
}

/* ---------------------------------------------------------------------- */
/* Passenger classification                                               */
/* ---------------------------------------------------------------------- */
function classify(age){
  if(age>=13) return 'adulto';
  if(age>=3)  return 'nino';
  return 'infante'; // 0-2
}

function guestListHTML(passengers){
  // passengers: [{name, age}]
  const adults = passengers.filter(p=>classify(p.age)==='adulto');
  const ninos  = passengers.filter(p=>classify(p.age)==='nino');
  const infantes = passengers.filter(p=>classify(p.age)==='infante');
  const lines = [];

  adults.forEach((p,i)=>{
    const last = i===adults.length-1;
    lines.push(upper(p.name) + (last ? `, ${adults.length} adultos` : ','));
  });
  ninos.forEach(p=>{
    lines.push(`${upper(p.name)}, 1 niño de ${p.age} años`);
  });
  infantes.forEach(p=>{
    lines.push(`${upper(p.name)}, 1 infante`);
  });
  if(adults.length===0 && lines.length===0){
    return '';
  }
  return lines.join('<br>');
}

/* ---------------------------------------------------------------------- */
/* Room type + bed distribution                                           */
/* ---------------------------------------------------------------------- */
function roomConfig(paxCount){
  if(paxCount<=1) return {tipo:'Habitación Individual', camas:'1 cama individual'};
  if(paxCount===2) return {tipo:'Habitación Doble', camas:'1 cama doble'};
  const dobles = Math.floor(paxCount/2);
  const resto  = paxCount%2;
  let parts=[];
  if(dobles>0) parts.push(`${dobles} cama${dobles>1?'s':''} doble${dobles>1?'s':''}`);
  if(resto>0) parts.push('1 cama individual');
  return {tipo:'Habitación Familiar', camas: parts.join(' y ')};
}

/* ---------------------------------------------------------------------- */
/* Itinerary distribution across the whole trip                           */
/* ---------------------------------------------------------------------- */
function buildItinerary(stays){
  // stays: sorted array of {hotel, checkin(Date), checkout(Date)}
  // returns array of {date, dayNumber, kind:'transfer-in'|'transfer-out'|'transfer-city'|'activity'|'free', text, titulo}
  const totalStart = stays[0].checkin;
  const totalEnd   = stays[stays.length-1].checkout;
  const totalDays  = nightsBetween(totalStart, totalEnd) + 1;

  const days = [];
  for(let i=0;i<totalDays;i++){
    days.push({ date: addDays(totalStart,i), dayNumber:i+1, kind:'free', text:'', titulo:'' });
  }

  // mark day 0 = arrival, last day = final departure
  days[0].kind='transfer-in';
  days[0].titulo='Traslado Aeropuerto - Hotel';
  days[0].text='Traslado Aeropuerto Hotel. En autobús compartido totalmente dotado con guía habla hispana e inglés.';

  days[totalDays-1].kind='transfer-out';
  days[totalDays-1].titulo='Traslado Hotel - Aeropuerto';
  days[totalDays-1].text='Traslado hotel aeropuerto en autobús compartido para tomar vuelo con destino país de origen.\nEl traslado Hotel Aeropuerto, la hora se programará con el pasajero previamente en el hotel o al finalizar los recorridos.\n';

  // mark inter-hotel transfer days (checkout day of stay i == checkin day of stay i+1)
  let cursor = 0;
  stays.forEach((s,idx)=>{
    const startIdx = nightsBetween(totalStart, s.checkin);
    const endIdx   = nightsBetween(totalStart, s.checkout);
    if(idx>0){
      days[startIdx].kind='transfer-city';
      days[startIdx].titulo='Traslado a la siguiente ciudad';
      days[startIdx].text=`Traslado en autobús cómodamente dotado a la ciudad de ${titleCase(s.hotel.city)}.\nTarde libre para disfrutar de las instalaciones del hotel.`;
    }
    const availableDayIndexes = [];
    for(let d = startIdx + 1; d < endIdx; d++){
      if(days[d].kind === 'free'){
        availableDayIndexes.push(d);
      }
    }
    // assign activities in the OPEN interval (startIdx, endIdx) i.e days strictly between
    const pool = (ITIN[s.hotel.itineraryCity] || []).slice();
    const numActivities = Math.min(pool.length, availableDayIndexes.length);
    if (numActivities > 0) {
      const totalAvailableDays = availableDayIndexes.length;
      const step = (totalAvailableDays > 1 && numActivities > 1)
        ? (totalAvailableDays - 1) / (numActivities - 1)
        : 0;
      for (let i = 0; i < numActivities; i++) {
        const offsetIndex = Math.round(i * step);
        const targetDayIdx = availableDayIndexes[offsetIndex];

        const item = pool[i];
        days[targetDayIdx].kind = 'activity';
        days[targetDayIdx].titulo = item.titulo;
        days[targetDayIdx].text = item.cuerpo;
      }
    }
  });

  return days.filter(d=>d.kind!=='free' || true); // keep all, free days simply omitted from PDF rendering
}

/* ---------------------------------------------------------------------- */
/* HTML template builders (mirrors the original MacroViajes layout)       */
/* ---------------------------------------------------------------------- */
const LOGO_SRC = 'assets/logo.png';
const CHECK_SRC = 'assets/check.png';
const FOOTER_SRC = 'assets/footer.png';

function footerHTML(){
  return `
  <div class="doc-footer">
    <div class="foot-row">
      <img class="footcurve" src="${FOOTER_SRC}">
    </div>
  </div>`;
}
function headerHTML(){
  return `
  <div class="doc-header">
    <div>
      <img class="logo" src="${LOGO_SRC}">
    </div>
  </div>`;
}

function pageConfirmation(titularName, estado, hotel, checkin, checkout, noches, confirmNo){
  return `
  <div class="doc-page">
    ${headerHTML()}
    <div class="doc-banner">
      <img class="check" src="${CHECK_SRC}">
      <div class="banner-text"><b>${upper(titularName)}</b>, ${estado}</div>
    </div>
    <div class="doc-hotelblock">
      <div class="hinfo">
        <a>${titleCase(hotel.name)}</a>
        <div>${hotel.street}</div>
        <div>${titleCase(hotel.city)}</div>
        <div>${hotel.postalCode}</div>
        <div>${hotel.country}</div>
        <div>${hotel.phone}</div>
      </div>
      <img class="hphoto" src="${hotel.photo}">
    </div>
    <div class="doc-table">
      <div class="trow"><div class="lbl">Número de confirmación del Hotel</div><div class="val">${confirmNo}</div></div>
      <div class="trow"><div class="lbl">Check-in</div><div class="val">${fmtLongDate(checkin)} (${hotel.checkinRange}, hora local)</div></div>
      <div class="trow"><div class="lbl">Check-out</div><div class="val">${fmtLongDate(checkout)} (Antes de ${hotel.checkoutTime}, hora local)</div></div>
      <div class="trow"><div class="lbl">Tu estadía</div><div class="val">${noches} noches, 1 unidad</div></div>
    </div>
    <div class="doc-section-title">Información de la propiedad</div>
    <div class="doc-proplock">
      <a>${titleCase(hotel.name)}</a>
      <div>${hotel.street}, ${titleCase(hotel.city)}, ${hotel.postalCode}, ${hotel.country}</div>
      <div>Teléfono: ${hotel.phone}</div>
    </div>
    <div class="doc-req">
      <div class="lbl">Requisitos para hacer el check-in</div>
      <ul>${hotel.requisitos.map(r=>`<li>${r}</li>`).join('')}</ul>
    </div>
    ${footerHTML()}
  </div>`;
}

function amenityLine(label, val){
  if(!val) return '';
  return `<p><b>${label}:</b> ${val}</p>`;
}

function pageUnitDetail(hotel, roomCfg, noches, guestsHTML, prefText){
  const a = hotel.amenities||{};
  const breakfasts = noches;
  const dinners = hotel.mealsPolicy==='dinner-minus-one' ? Math.max(noches-1,0) : noches;
  return `
  <div class="doc-page">
    ${headerHTML()}
    <div class="doc-unit-title">Detalles de la unidad</div>
    <div class="doc-unit-sub">${roomCfg.tipo}</div>
    <div class="doc-field">
      <div class="lbl">Huéspedes</div>
      <div class="val">${guestsHTML}</div>
    </div>
    <div class="doc-field">
      <div class="lbl">Preferencias</div>
      <div class="val">
        ${prefText}
        <div class="doc-note"><b>Nota:</b> no se pueden garantizar las preferencias ni las solicitudes. Las solicitudes especiales dependen de la disponibilidad al momento de hacer el check-in y pueden dar lugar a cargos adicionales.</div>
      </div>
    </div>
    <div class="doc-field">
      <div class="lbl">Instalaciones</div>
      <div class="val doc-fac">
        <div class="doc-fac-title">WIFI GRATIS</div>
        <p><b>${breakfasts} Desayuno${breakfasts!==1?'s':''}, ${dinners} Cena${dinners!==1?'s':''} por persona</b></p>
        <p><b>${roomCfg.camas}</b></p>
        ${amenityLine('Internet', a.internet)}
        ${amenityLine('Alimentos y bebidas', a.alimentos)}
        ${amenityLine('Descanso', a.descanso)}
        ${amenityLine('Entretenimiento', a.entretenimiento)}
        ${amenityLine('Cuarto de baño', a.bano)}
        ${amenityLine('Información práctica', a.infoPractica)}
        ${amenityLine('Detalles prácticos', a.detallesPracticos)}
        ${amenityLine('Comodidades', a.comodidades)}
        ${amenityLine('Facilidades de acceso para discapacitados', a.accesoDiscapacitados)}
        ${amenityLine('Información importante', a.infoImportante)}
        <p>${a.fumadores||''}</p>
      </div>
    </div>
    ${footerHTML()}
  </div>`;
}

function pageItinerary(dayGroup, isFirstPage = false, isLastPage = false){
  // dayGroup: array of day objects (already filtered to non-free), max ~6 per page
  return `
  <div class="doc-page">
    ${headerHTML()}
    ${isFirstPage ? '<div class="doc-itin-title">EUROPA A TU MANERA</div>' : ''}
    ${dayGroup.map(d=>`
      <div class="doc-day">
        <h4>${fmtShortDate(d.date)}, DÍA ${String(d.dayNumber).padStart(2,'0')}</h4>
        <p>${mdBold(d.text)}</p>
      </div>
    `).join('')}
    ${isLastPage ? '<div class="doc-itin-end">FIN DEL RECORRIDO</div>' : ''}
    ${footerHTML()}
  </div>`;
}

/* ---------------------------------------------------------------------- */
/* Document generation                                                    */
/* ---------------------------------------------------------------------- */
function buildDocumentHTML(passengers, stays){
  const titular = passengers.slice().sort((a,b)=>b.age-a.age)[0];
  const roomCfg = roomConfig(passengers.length);
  const prefParts = [];
  prefParts.push('Para no fumadores');
  prefParts.push(roomCfg.camas);
  const prefText = prefParts.join(', ');
  const guestsHTML = guestListHTML(passengers);

  let pagesHTML = '';
  stays.forEach((s,idx)=>{
    const noches = nightsBetween(s.checkin, s.checkout);
    const estado = idx===0 ? 'tu reservación está garantizada.' : 'tu reservación está garantizada.';
    pagesHTML += pageConfirmation(titular.name, estado, s.hotel, s.checkin, s.checkout, noches, s.confirmNo);
    pagesHTML += pageUnitDetail(s.hotel, roomCfg, noches, guestsHTML, prefText);
  });

  // itinerary across the whole trip
  const allDays = buildItinerary(stays).filter(d=>d.kind!=='free');
  const perPage = 4;
  for(let i=0;i<allDays.length;i+=perPage){
    const isFirstPage = (i === 0);
    const isLastPage = (i + perPage >= allDays.length);
    pagesHTML += pageItinerary(allDays.slice(i, i + perPage), isFirstPage, isLastPage);
  }

  return { html: pagesHTML, titular };
}

function waitForImages(container){
  const imgs = Array.from(container.querySelectorAll('img'));
  return Promise.all(imgs.map(img=>{
    if(img.complete && img.naturalWidth>0) return Promise.resolve();
    return new Promise(resolve=>{
      img.addEventListener('load', resolve, {once:true});
      img.addEventListener('error', resolve, {once:true}); // don't block forever on a missing photo
    });
  }));
}

async function generatePDF(passengers, stays){
  const { html, titular } = buildDocumentHTML(passengers, stays);
  const overlay = document.getElementById('pdf-overlay');
  const root = document.getElementById('pdf-render-root');
  const msg = document.getElementById('pdf-overlay-msg');

  root.innerHTML = html;
  overlay.classList.add('show');
  msg.textContent = 'Cargando imágenes...';

  // The element must be genuinely visible on screen (not hidden via off-screen
  // positioning) or html2canvas can measure it with zero height and export a blank page.
  await waitForImages(root);
  // Let the browser finish layout/paint before capturing.
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

  const filename = upper(titular.name).trim().replace(/\s+/g,'_') + '.pdf';
  msg.textContent = 'Generando PDF...';

  const opt = {
    margin: 0,
    filename,
    image: { type:'jpeg', quality:0.98 },
    html2canvas: { scale:2, useCORS:true, allowTaint:true, logging:false },
    jsPDF: { unit:'in', format: 'letter', orientation:'portrait' }
  };

  // Render one canvas per .doc-page and add each as its own PDF page explicitly.
  // (html2pdf's automatic multi-page slicing of a single tall canvas is unreliable
  // and can insert blank pages between sections, so we drive pagination ourselves.)
  const pages = Array.from(root.querySelectorAll('.doc-page'));
  try{
    let worker = html2pdf().set(opt).from(pages[0]).toContainer().toCanvas().toPdf();
    for(let i=1;i<pages.length;i++){
      const page = pages[i];
      worker = worker.get('pdf').then(pdf=>{ pdf.addPage(); })
                      .from(page).toContainer().toCanvas().toPdf();
    }
    await worker.get('pdf').then(pdf=> pdf.save(filename));
    toast('Documento generado: ' + filename);
  } finally {
    overlay.classList.remove('show');
    root.innerHTML='';
  }
}

/* =========================================================================
   UI: Hoteles tab
   ========================================================================= */
function emptyHotel(){
  return {
    id: 'h_' + Date.now(),
    name:'', street:'', city:'', postalCode:'', country:'ES', phone:'',
    photo:'assets/sample-hotel-toledo.jpg',
    checkinRange:'15:00 - 23:00', checkoutTime:'11:00',
    mealsPolicy:'equal', itineraryCity:'',
    amenities:{ internet:'wifi gratis', alimentos:'servicio a la habitación', descanso:'ropa de cama', bano:'baño privado', infoPractica:'', comodidades:'aire acondicionado y servicio de limpieza diario', accesoDiscapacitados:'', infoImportante:'cunas o camas plegables/extra no disponibles', fumadores:'Para no fumadores', entretenimiento:'', detallesPracticos:'' },
    requisitos:[
      'Es obligatorio dejar un depósito en efectivo, con tarjeta de débito o con tarjeta de crédito para cubrir gastos imprevistos',
      'Es obligatorio presentar una identificación oficial válida',
      'La edad mínima para realizar el check-in es de 18 años.'
    ]
  };
}

let editingHotelId = null;

function renderHotelsTab(){
  const list = document.getElementById('hotelsList');
  list.innerHTML = HOTELS.map(h=>`
    <div class="row-item">
      <button class="btn small secondary" onclick="editHotel('${h.id}')">Editar</button>
      <button class="btn small danger" onclick="deleteHotel('${h.id}')" style="margin-left:6px;">Eliminar</button>
      <h3 style="margin-top:2px;">${titleCase(h.name)||'(sin nombre)'}</h3>
      <div class="muted">${h.street||''} · ${titleCase(h.city)||''} · ${h.postalCode||''} · ${h.country||''}</div>
      <div class="muted">Tel: ${h.phone||''} · Check-in ${h.checkinRange||''} · Check-out ${h.checkoutTime||''}</div>
      <div class="muted">Pool de itinerario asociado: <b>${h.itineraryCity||'(ninguno)'}</b></div>
    </div>
  `).join('') || '<p class="muted">Aún no hay hoteles. Agrega el primero abajo.</p>';

  const citySelect = document.getElementById('hotelItinCity');
  citySelect.innerHTML = Object.keys(ITIN).map(c=>`<option value="${c}">${c}</option>`).join('') + '<option value="">(otro / nuevo)</option>';
}

function editHotel(id){
  const h = HOTELS.find(x=>x.id===id);
  if(!h) return;
  editingHotelId = id;
  fillHotelForm(h);
  document.getElementById('hotelFormTitle').textContent = 'Editando: ' + titleCase(h.name);
  window.scrollTo({top:document.getElementById('hotelForm').offsetTop-20, behavior:'smooth'});
}
function deleteHotel(id){
  if(!confirm('¿Eliminar este hotel?')) return;
  HOTELS = HOTELS.filter(x=>x.id!==id);
  saveHotels(); renderHotelsTab(); renderStaysHotelOptions();
}
function fillHotelForm(h){
  document.getElementById('hName').value = h.name||'';
  document.getElementById('hStreet').value = h.street||'';
  document.getElementById('hCity').value = h.city||'';
  document.getElementById('hPostal').value = h.postalCode||'';
  document.getElementById('hCountry').value = h.country||'ES';
  document.getElementById('hPhone').value = h.phone||'';
  document.getElementById('hPhoto').value = h.photo||'';
  document.getElementById('hCheckin').value = h.checkinRange||'';
  document.getElementById('hCheckout').value = h.checkoutTime||'';
  document.getElementById('hMeals').value = h.mealsPolicy||'equal';
  document.getElementById('hotelItinCity').value = h.itineraryCity||'';
  document.getElementById('hItinNew').value='';
  const a = h.amenities||{};
  document.getElementById('aInternet').value=a.internet||'';
  document.getElementById('aAlimentos').value=a.alimentos||'';
  document.getElementById('aDescanso').value=a.descanso||'';
  document.getElementById('aEntretenimiento').value=a.entretenimiento||'';
  document.getElementById('aBano').value=a.bano||'';
  document.getElementById('aInfoPractica').value=a.infoPractica||'';
  document.getElementById('aDetallesPracticos').value=a.detallesPracticos||'';
  document.getElementById('aComodidades').value=a.comodidades||'';
  document.getElementById('aAcceso').value=a.accesoDiscapacitados||'';
  document.getElementById('aInfoImportante').value=a.infoImportante||'';
  document.getElementById('hRequisitos').value=(h.requisitos||[]).join('\n');
}
function clearHotelForm(){
  editingHotelId=null;
  fillHotelForm(emptyHotel());
  document.getElementById('hotelFormTitle').textContent='Nuevo hotel';
}
function saveHotelForm(){
  const newCity = document.getElementById('hItinNew').value.trim();
  const itinCity = newCity || document.getElementById('hotelItinCity').value;
  const h = {
    id: editingHotelId || ('h_'+Date.now()),
    name: document.getElementById('hName').value.trim(),
    street: document.getElementById('hStreet').value.trim(),
    city: document.getElementById('hCity').value.trim(),
    postalCode: document.getElementById('hPostal').value.trim(),
    country: document.getElementById('hCountry').value.trim()||'ES',
    phone: document.getElementById('hPhone').value.trim(),
    photo: document.getElementById('hPhoto').value.trim()||'assets/sample-hotel-toledo.jpg',
    checkinRange: document.getElementById('hCheckin').value.trim(),
    checkoutTime: document.getElementById('hCheckout').value.trim(),
    mealsPolicy: document.getElementById('hMeals').value,
    itineraryCity: itinCity,
    amenities:{
      internet: document.getElementById('aInternet').value.trim(),
      alimentos: document.getElementById('aAlimentos').value.trim(),
      descanso: document.getElementById('aDescanso').value.trim(),
      entretenimiento: document.getElementById('aEntretenimiento').value.trim(),
      bano: document.getElementById('aBano').value.trim(),
      infoPractica: document.getElementById('aInfoPractica').value.trim(),
      detallesPracticos: document.getElementById('aDetallesPracticos').value.trim(),
      comodidades: document.getElementById('aComodidades').value.trim(),
      accesoDiscapacitados: document.getElementById('aAcceso').value.trim(),
      infoImportante: document.getElementById('aInfoImportante').value.trim(),
      fumadores: 'Para no fumadores'
    },
    requisitos: document.getElementById('hRequisitos').value.split('\n').map(s=>s.trim()).filter(Boolean)
  };
  if(!h.name){ toast('Ponle un nombre al hotel'); return; }
  if(itinCity && !ITIN[itinCity]) { ITIN[itinCity]=[]; saveItin(); }

  if(editingHotelId){
    const idx = HOTELS.findIndex(x=>x.id===editingHotelId);
    HOTELS[idx]=h;
  } else {
    HOTELS.push(h);
  }
  saveHotels();
  clearHotelForm();
  renderHotelsTab();
  renderItinTab();
  renderStaysHotelOptions();
  toast('Hotel guardado');
}

function exportHotels(){ downloadJSON(HOTELS, 'hotels.json'); }
function importHotelsFile(evt){
  const file = evt.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    try{
      const data = JSON.parse(e.target.result);
      if(!Array.isArray(data)) throw new Error('formato inválido');
      HOTELS = data; saveHotels(); renderHotelsTab(); renderStaysHotelOptions();
      toast('Hoteles importados');
    }catch(err){ alert('Archivo JSON inválido: '+err.message); }
  };
  reader.readAsText(file);
}

/* =========================================================================
   UI: Itinerarios tab
   ========================================================================= */
function renderItinTab(){
  const sel = document.getElementById('itinCitySelect');
  const current = sel.value;
  sel.innerHTML = Object.keys(ITIN).map(c=>`<option value="${c}">${c}</option>`).join('');
  if(Object.keys(ITIN).includes(current)) sel.value = current;
  renderItinActivities();
}
function renderItinActivities(){
  const city = document.getElementById('itinCitySelect').value;
  const box = document.getElementById('itinActivities');
  if(!city){ box.innerHTML='<p class="muted">Crea o selecciona un destino.</p>'; return; }
  const list = ITIN[city]||[];
  box.innerHTML = list.map((it,i)=>`
    <div class="row-item">
      <button class="btn small danger remove-btn" onclick="removeActivity('${city.replace(/'/g,"\\'")}',${i})">Eliminar</button>
      <b>${it.titulo}</b>
      <p style="white-space:pre-line;font-size:12.5px;color:#444;margin:6px 0 0;">${it.cuerpo}</p>
    </div>
  `).join('') || '<p class="muted">Sin actividades todavía.</p>';
}
function addCity(){
  const name = document.getElementById('newCityName').value.trim();
  if(!name) return;
  if(!ITIN[name]) ITIN[name]=[];
  saveItin();
  document.getElementById('newCityName').value='';
  renderItinTab();
  document.getElementById('itinCitySelect').value=name;
  renderItinActivities();
  renderHotelsTab();
}
function deleteCity(){
  const city = document.getElementById('itinCitySelect').value;
  if(!city) return;
  if(!confirm(`¿Eliminar el destino "${city}" y todas sus actividades?`)) return;
  delete ITIN[city];
  saveItin(); renderItinTab(); renderHotelsTab();
}
function addActivity(){
  const city = document.getElementById('itinCitySelect').value;
  if(!city){ toast('Selecciona un destino primero'); return; }
  const titulo = document.getElementById('actTitulo').value.trim();
  const cuerpo = document.getElementById('actCuerpo').value.trim();
  if(!titulo || !cuerpo){ toast('Completa título y descripción'); return; }
  ITIN[city].push({titulo, cuerpo});
  saveItin();
  document.getElementById('actTitulo').value='';
  document.getElementById('actCuerpo').value='';
  renderItinActivities();
}
function removeActivity(city, idx){
  ITIN[city].splice(idx,1);
  saveItin(); renderItinActivities();
}
function exportItin(){ downloadJSON(ITIN, 'itinerarios.json'); }
function importItinFile(evt){
  const file = evt.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    try{
      const data = JSON.parse(e.target.result);
      ITIN = data; saveItin(); renderItinTab(); renderHotelsTab();
      toast('Itinerarios importados');
    }catch(err){ alert('Archivo JSON inválido: '+err.message); }
  };
  reader.readAsText(file);
}

function downloadJSON(obj, filename){
  const blob = new Blob([JSON.stringify(obj,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

/* =========================================================================
   UI: Generar tab
   ========================================================================= */
let passengerRows = 1;
let stayRows = 1;

function renderPassengerRows(){
  const box = document.getElementById('passengersBox');
  box.innerHTML='';
  for(let i=0;i<passengerRows;i++){
    box.insertAdjacentHTML('beforeend', `
      <div class="row-item" id="prow_${i}">
        ${passengerRows>1?`<button class="btn small danger remove-btn" onclick="removePassenger(${i})">Quitar</button>`:''}
        <div class="grid2">
          <div><label>Nombre completo</label><input type="text" id="pname_${i}" placeholder="Ej: Juan Pérez"></div>
          <div><label>Edad (años)</label><input type="number" id="page_${i}" min="0" max="110" placeholder="Ej: 34"></div>
        </div>
      </div>
    `);
  }
}
function addPassenger(){ passengerRows++; syncPassengerValues(); renderPassengerRows(); restorePassengerValues(); }
function removePassenger(i){
  syncPassengerValues();
  passengerCache.splice(i,1);
  passengerRows--;
  renderPassengerRows();
  restorePassengerValues();
}
let passengerCache = [];
function syncPassengerValues(){
  passengerCache = [];
  for(let i=0;i<passengerRows;i++){
    const n = document.getElementById('pname_'+i);
    const a = document.getElementById('page_'+i);
    if(n) passengerCache.push({name:n.value, age:a.value});
  }
}
function restorePassengerValues(){
  passengerCache.forEach((p,i)=>{
    const n = document.getElementById('pname_'+i);
    const a = document.getElementById('page_'+i);
    if(n){ n.value=p.name; a.value=p.age; }
  });
}

function renderStaysHotelOptions(){
  for(let i=0;i<stayRows;i++){
    const sel = document.getElementById('shotel_'+i);
    if(!sel) continue;
    const cur = sel.value;
    sel.innerHTML = '<option value="">-- selecciona hotel --</option>' + HOTELS.map(h=>`<option value="${h.id}">${titleCase(h.name)} (${titleCase(h.city)})</option>`).join('');
    if(cur) sel.value = cur;
  }
}
function renderStayRows(){
  const box = document.getElementById('staysBox');
  box.innerHTML='';
  for(let i=0;i<stayRows;i++){
    box.insertAdjacentHTML('beforeend', `
      <div class="row-item" id="srow_${i}">
        ${stayRows>1?`<button class="btn small danger remove-btn" onclick="removeStay(${i})">Quitar</button>`:''}
        <div class="grid4">
          <div><label>Hotel</label><select id="shotel_${i}" required></select></div>
          <div><label>Check-in</label><input type="date" id="sin_${i}" required></div>
          <div><label>Check-out</label><input type="date" id="sout_${i}" required></div>
          <div><label>Número de confirmación</label><input type="text" id="sconf_${i}" placeholder="Ej: 0123456789" required></div>
        </div>
      </div>
    `);
  }
  renderStaysHotelOptions();
}
function addStay(){ stayRows++; renderStayRows(); }
function removeStay(i){ stayRows--; renderStayRows(); }

function readPassengersFromForm(){
  const list=[];
  for(let i=0;i<passengerRows;i++){
    const name = document.getElementById('pname_'+i)?.value.trim();
    const age = parseInt(document.getElementById('page_'+i)?.value,10);
    if(name && !isNaN(age)) list.push({name, age});
  }
  return list;
}
function readStaysFromForm(){
  const list=[];
  for(let i=0;i<stayRows;i++){
    const hid = document.getElementById('shotel_'+i)?.value;
    const cin = document.getElementById('sin_'+i)?.value;
    const cout = document.getElementById('sout_'+i)?.value;
    const conf = document.getElementById('sconf_'+i)?.value.trim();
    if(hid && cin && cout){
      const hotel = HOTELS.find(h=>h.id===hid);
      list.push({ hotel, checkin: parseDate(cin), checkout: parseDate(cout), confirmNo: conf });
    }
  }
  list.sort((a,b)=>a.checkin-b.checkin);
  return list;
}

async function onGenerateClick(){
  const passengers = readPassengersFromForm();
  const stays = readStaysFromForm();
  if(passengers.length===0){ alert('Agrega al menos un pasajero con nombre y edad.'); return; }
  if(stays.length===0){ alert('Agrega al menos una estadía de hotel con fechas válidas.'); return; }
  for(const s of stays){
    if(s.checkout<=s.checkin){ alert('La fecha de check-out debe ser posterior al check-in.'); return; }
  }
  const btn = document.getElementById('generateBtn');
  btn.disabled=true; btn.textContent='Generando...';
  try{
    await generatePDF(passengers, stays);
  }catch(e){
    console.error(e);
    alert('Ocurrió un error generando el PDF: '+e.message);
  }finally{
    btn.disabled=false; btn.textContent='Generar y descargar PDF';
  }
}

/* =========================================================================
   Tabs
   ========================================================================= */
function switchTab(name){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active', p.id==='panel-'+name));
}

/* =========================================================================
   Init
   ========================================================================= */
window.addEventListener('DOMContentLoaded', async ()=>{
  await loadData();
  renderHotelsTab();
  clearHotelForm();
  renderItinTab();
  renderPassengerRows();
  renderStayRows();

  document.querySelectorAll('.tab-btn').forEach(b=>b.addEventListener('click', ()=>switchTab(b.dataset.tab)));
  document.getElementById('addPassengerBtn').addEventListener('click', addPassenger);
  document.getElementById('addStayBtn').addEventListener('click', addStay);
  document.getElementById('generateBtn').addEventListener('click', onGenerateClick);
  document.getElementById('saveHotelBtn').addEventListener('click', saveHotelForm);
  document.getElementById('newHotelBtn').addEventListener('click', clearHotelForm);
  document.getElementById('exportHotelsBtn').addEventListener('click', exportHotels);
  document.getElementById('importHotelsInput').addEventListener('change', importHotelsFile);
  document.getElementById('addCityBtn').addEventListener('click', addCity);
  document.getElementById('deleteCityBtn').addEventListener('click', deleteCity);
  document.getElementById('itinCitySelect').addEventListener('change', renderItinActivities);
  document.getElementById('addActivityBtn').addEventListener('click', addActivity);
  document.getElementById('exportItinBtn').addEventListener('click', exportItin);
  document.getElementById('importItinInput').addEventListener('change', importItinFile);
});
