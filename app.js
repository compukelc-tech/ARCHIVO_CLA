// VARIABLES GLOBALES
let capturasEscaner = [];
let streamCamaraActual = null;
let formatoElegido = 'pdf';
let archivosEnCola = [];

// Tu URL correcta del Archivo Personal
const GOOGLE_APP_URL = 'https://script.google.com/macros/s/AKfycbzfA0H0mZdrGx9f8QztKlo_71xPxDeKgmduyYJrC0YRSDXqhlg3I3HgzUecWk-SfRDH/exec'; 

// INICIALIZACIÓN Y BARRERA DE SEGURIDAD MATRIZ
document.addEventListener('DOMContentLoaded', () => {
  verificarBloqueoCentral(); 
  
  configurarEventosLogin();
  configurarEventosNavegacion();
  configurarEventosSubida(); 
  configurarEventosEscaner();
  configurarEventosDocumentos();
  
  const token = localStorage.getItem('compukelc_token') || sessionStorage.getItem('compukelc_token');
  if (token) {
    document.getElementById('vista-login').classList.add('oculto');
    document.getElementById('vista-app').classList.remove('oculto');
    cargarCarpetas(token);
    cargarDocumentos(); 
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Error:', err));
  }
});

async function verificarBloqueoCentral() {
  try {
    // Usamos POST con un action "ping" para evitar errores de redirección 404 (CORS) de Google Script
    const respuesta = await fetch(GOOGLE_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'ping' })
    });
    const datos = await respuesta.json();

    if (datos.error === 'ACCESO_BLOQUEADO') {
      activarPantallaBloqueo(datos.mensaje);
    }
  } catch (error) {
    console.log("Verificación silenciosa falló, se reintentará en login.");
  }
}

function activarPantallaBloqueo(mensajeCentral) {
  // Ocultamos las vistas normales forzando la clase
  const vistaLogin = document.getElementById('vista-login');
  const vistaApp = document.getElementById('vista-app');
  if(vistaLogin) vistaLogin.classList.add('oculto');
  if(vistaApp) vistaApp.classList.add('oculto');
  
  // Mostramos el contenedor de bloqueo forzando el estilo para saltar el CSS conflictivo
  const vistaBloqueo = document.getElementById('vista-bloqueo');
  if(vistaBloqueo) {
    vistaBloqueo.classList.remove('oculto');
    vistaBloqueo.style.display = 'flex'; 
    document.getElementById('mensaje-bloqueo').textContent = mensajeCentral || 'Mantenimiento en curso';
  }
}

// MÓDULO INTERFAZ — Login
function configurarEventosLogin() {
  const btnToggleClave = document.getElementById('btn-toggle-clave');
  const inputClave = document.getElementById('input-clave');
  const formLogin = document.getElementById('form-login');
  
  if (btnToggleClave && inputClave) {
    btnToggleClave.addEventListener('click', () => {
      const esPassword = inputClave.getAttribute('type') === 'password';
      inputClave.setAttribute('type', esPassword ? 'text' : 'password');
    });
  }

  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const usuario = document.getElementById('input-usuario').value;
      const clave = document.getElementById('input-clave').value;
      const recordar = document.getElementById('input-recordar').checked;
      const btnLogin = document.getElementById('btn-login');
      const errorDiv = document.getElementById('login-error');
      
      btnLogin.disabled = true;
      btnLogin.textContent = 'Autenticando...';
      errorDiv.classList.add('oculto');
      
      try {
        const respuesta = await fetch(GOOGLE_APP_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'login', usuario: usuario, clave: clave })
        });
        
        const datos = await respuesta.json();
        
        // 🛡️ BARRERA: Por si lo bloquean justo en este momento
        if (datos.error === 'ACCESO_BLOQUEADO') {
          activarPantallaBloqueo(datos.mensaje);
          return;
        }
        
        if (datos.ok) {
          if (recordar) {
            localStorage.setItem('compukelc_token', datos.token);
          } else {
            sessionStorage.setItem('compukelc_token', datos.token);
          }
          
          document.getElementById('vista-login').classList.add('oculto');
          document.getElementById('vista-app').classList.remove('oculto');
          document.getElementById('chip-nombre').textContent = datos.usuario.nombre || datos.usuario.usuario;
          document.getElementById('chip-cargo').textContent = datos.usuario.cargo || datos.usuario.rol;
          
          cargarCarpetas(datos.token);
          cargarDocumentos(); 
        } else {
          errorDiv.textContent = datos.error || 'Error de credenciales';
          errorDiv.classList.remove('oculto');
        }
      } catch (error) {
        errorDiv.textContent = 'Error de conexión. Revisa tu internet.';
        errorDiv.classList.remove('oculto');
      } finally {
        btnLogin.disabled = false;
        btnLogin.textContent = 'Iniciar sesión';
      }
    });
  }

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) btnLogout.addEventListener('click', cerrarSesion);
}

function cerrarSesion() {
  localStorage.removeItem('compukelc_token');
  sessionStorage.removeItem('compukelc_token');
  window.location.reload();
}

// NAVEGACIÓN Y UTILIDADES UI
function configurarEventosNavegacion() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      navItems.forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');
      cambiarVista(btn.dataset.vista);
      if(btn.dataset.vista === 'documentos') cargarDocumentos();
    });
  });
}

function cambiarVista(vistaId) {
  document.querySelectorAll('.seccion').forEach(sec => sec.classList.add('oculto'));
  const seccion = document.getElementById('seccion-' + vistaId);
  if (seccion) seccion.classList.remove('oculto');
}

function mostrarToast(mensaje, tipo) {
  const toast = document.getElementById('toast');
  toast.textContent = mensaje;
  toast.className = '';
  toast.classList.add('mostrar', tipo);
  setTimeout(() => toast.classList.remove('mostrar'), 3000);
}

// MÓDULO DOCUMENTOS
function configurarEventosDocumentos() {
  document.getElementById('filtro-anio').addEventListener('change', cargarDocumentos);
  document.getElementById('filtro-mes').addEventListener('change', cargarDocumentos);
  document.getElementById('filtro-dia').addEventListener('change', cargarDocumentos);
  document.getElementById('filtro-texto').addEventListener('input', filtrarTablaTexto);
}

async function cargarDocumentos() {
  const token = localStorage.getItem('compukelc_token') || sessionStorage.getItem('compukelc_token');
  if (!token) return;

  const anio = document.getElementById('filtro-anio').value;
  const mes = document.getElementById('filtro-mes').value;
  const dia = document.getElementById('filtro-dia').value;
  const vacioDiv = document.getElementById('documentos-vacio');
  const tabla = document.getElementById('tabla-documentos');

  vacioDiv.textContent = 'Cargando documentos...';
  vacioDiv.classList.remove('oculto');
  tabla.classList.add('oculto');

  try {
    const res = await fetch(GOOGLE_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'obtenerRegistro', token: token, filtros: { anio, mes, dia } })
    });
    const datos = await res.json();
    
    // 🛡️ BARRERA: Por si lo bloquean mientras navega
    if (datos.error === 'ACCESO_BLOQUEADO') {
      activarPantallaBloqueo(datos.mensaje);
      return;
    }

    if (datos.ok) {
      actualizarDesplegables(datos.disponibles);
      renderizarTabla(datos.registros);
    } else {
      if(datos.error && (datos.error.includes('expirada') || datos.error.includes('inválido'))){
         cerrarSesion();
      } else {
         vacioDiv.textContent = 'Error: ' + datos.error;
      }
    }
  } catch (error) {
    vacioDiv.textContent = 'Error de conexión al cargar el archivo de compukelc.';
  }
}

function actualizarDesplegables(disp) {
  const llenar = (id, valores, etiqueta) => {
    const sel = document.getElementById(id);
    const valActual = sel.value;
    sel.innerHTML = `<option value="todos">${etiqueta}: todos</option>`;
    valores.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    });
    if (valores.includes(valActual)) sel.value = valActual;
  };
  llenar('filtro-anio', disp.anios, 'Año');
  llenar('filtro-mes', disp.meses, 'Mes');
  llenar('filtro-dia', disp.dias, 'Día');
}

function renderizarTabla(registros) {
  const vacioDiv = document.getElementById('documentos-vacio');
  const tabla = document.getElementById('tabla-documentos');
  
  window.registrosActuales = registros; 
  if (registros.length === 0) {
    vacioDiv.textContent = 'No hay documentos que coincidan con los filtros.';
    vacioDiv.classList.remove('oculto');
    tabla.classList.add('oculto');
  } else {
    vacioDiv.classList.add('oculto');
    tabla.classList.remove('oculto');
    filtrarTablaTexto(); 
  }
}

function filtrarTablaTexto() {
  const textoBusqueda = document.getElementById('filtro-texto').value.toLowerCase();
  const anio = document.getElementById('filtro-anio').value;
  const mes = document.getElementById('filtro-mes').value;
  const dia = document.getElementById('filtro-dia').value;
  
  const tbody = document.getElementById('cuerpo-documentos');
  const registros = window.registrosActuales || [];
  const vacioDiv = document.getElementById('documentos-vacio');
  const tabla = document.getElementById('tabla-documentos');

  tbody.innerHTML = '';
  let contador = 0;

  if (textoBusqueda === '' && anio === 'todos' && mes === 'todos' && dia === 'todos') {
     tabla.classList.add('oculto');
     vacioDiv.textContent = 'Utiliza la barra de búsqueda o los filtros de fecha para visualizar los documentos.';
     vacioDiv.classList.remove('oculto');
     return; 
  }

  registros.forEach(r => {
    const nombre = r.nombreArchivo || '';
    const carpeta = r.carpetaDestino || '';
    
    if (nombre.toLowerCase().includes(textoBusqueda) || carpeta.toLowerCase().includes(textoBusqueda)) {
      contador++;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><a href="${r.url}" target="_blank" rel="noopener noreferrer">${nombre}</a></td>
        <td>${carpeta}</td>
        <td class="fecha-mono">${r.fecha}</td>
        <td class="fecha-mono">${r.hora}</td>
        <td>${r.tipo}</td>
      `;
      tbody.appendChild(tr);
    }
  });

  if (contador === 0 && registros.length > 0) {
     tabla.classList.add('oculto');
     vacioDiv.textContent = 'Ningún documento coincide con la búsqueda.';
     vacioDiv.classList.remove('oculto');
  } else if (registros.length > 0) {
     tabla.classList.remove('oculto');
     vacioDiv.classList.add('oculto');
  }
}

// MÓDULO SUBIDA DE ARCHIVOS
function configurarEventosSubida() {
  const dropzone = document.getElementById('dropzone');
  const inputArchivos = document.getElementById('input-archivos');
  const btnSubir = document.getElementById('btn-subir');

  if (!dropzone || !inputArchivos || !btnSubir) return;

  dropzone.addEventListener('click', () => inputArchivos.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('arrastrando'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('arrastrando'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('arrastrando');
    if (e.dataTransfer.files.length) procesarArchivosSeleccionados(e.dataTransfer.files);
  });

  inputArchivos.addEventListener('change', (e) => {
    if (e.target.files.length) procesarArchivosSeleccionados(e.target.files);
    inputArchivos.value = ''; 
  });

  btnSubir.addEventListener('click', subirArchivosADrive);
}

async function procesarArchivosSeleccionados(files) {
  for (let file of files) {
    const base64 = await convertirABase64(file);
    archivosEnCola.push({
      id: 'file' + Date.now() + Math.random().toString(36).substr(2, 5),
      nombre: file.name,
      base64: base64.split(',')[1], 
      mime: file.type || 'application/octet-stream',
      peso: file.size,
      estado: 'pendiente'
    });
  }
  renderizarListaArchivos();
}

function convertirABase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

function renderizarListaArchivos() {
  const lista = document.getElementById('lista-archivos');
  const btnSubir = document.getElementById('btn-subir');
  if(!lista) return;
  
  lista.innerHTML = '';
  archivosEnCola.forEach((archivo, index) => {
    const item = document.createElement('div');
    item.className = 'item-archivo';
    item.innerHTML = `
      <div class="nombre">${archivo.nombre}</div>
      <div class="peso">${(archivo.peso / 1024).toFixed(1)} KB</div>
      <div class="estado ${archivo.estado}">${archivo.estado}</div>
      ${archivo.estado === 'pendiente' || archivo.estado === 'error' ? `<button class="btn-quitar" onclick="quitarArchivo(${index})">✕</button>` : ''}
    `;
    lista.appendChild(item);
  });

  const hayPendientes = archivosEnCola.some(a => a.estado === 'pendiente' || a.estado === 'error');
  if(btnSubir) btnSubir.disabled = !hayPendientes;
}

window.quitarArchivo = function(index) {
  archivosEnCola.splice(index, 1);
  renderizarListaArchivos();
}

async function subirArchivosADrive() {
  const inputCarpeta = document.getElementById('input-carpeta');
  const carpeta = inputCarpeta.value.trim() || 'General';
  const token = localStorage.getItem('compukelc_token') || sessionStorage.getItem('compukelc_token');
  
  if (!token) {
    mostrarToast('Error: Sesión expirada.', 'error');
    cerrarSesion();
    return;
  }

  const pendientes = archivosEnCola.filter(a => a.estado === 'pendiente' || a.estado === 'error');
  
  for (let archivo of pendientes) {
    archivo.estado = 'subiendo';
    renderizarListaArchivos();

    try {
      const res = await fetch(GOOGLE_APP_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'subirArchivo', token: token, nombreArchivo: archivo.nombre,
          base64Data: archivo.base64, carpetaDestino: carpeta, tipoMime: archivo.mime, tipoOrigen: 'Subida manual'
        })
      });
      const datos = await res.json();
      
      // 🛡️ BARRERA
      if (datos.error === 'ACCESO_BLOQUEADO') {
        activarPantallaBloqueo(datos.mensaje);
        return;
      }
      
      if (datos.ok) {
        archivo.estado = 'listo';
      } else {
        archivo.estado = 'error';
        mostrarToast('Error en archivo: ' + datos.error, 'error');
      }
    } catch (error) {
      archivo.estado = 'error';
      mostrarToast('Fallo de red al subir', 'error');
    }
    renderizarListaArchivos();
  }
  
  if (archivosEnCola.every(a => a.estado === 'listo')) {
    mostrarToast('Archivos guardados en compukelc', 'exito');
    inputCarpeta.value = '';
    cargarCarpetas(token); 
    setTimeout(() => { archivosEnCola = []; renderizarListaArchivos(); }, 2000);
  }
}

async function cargarCarpetas(token) {
  try {
    const res = await fetch(GOOGLE_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'listarCarpetas', token: token })
    });
    const datos = await res.json();
    
    // 🛡️ BARRERA
    if (datos.error === 'ACCESO_BLOQUEADO') {
      activarPantallaBloqueo(datos.mensaje);
      return;
    }
    
    if (datos.ok && datos.carpetas) {
      const datalist = document.getElementById('lista-carpetas');
      if (datalist) {
        datalist.innerHTML = '';
        datos.carpetas.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c;
          datalist.appendChild(opt);
        });
      }
    }
  } catch (error) { console.error('No se pudieron cargar las carpetas.'); }
}

// MÓDULO ESCÁNER
function configurarEventosEscaner() {
  const $ = (selector) => document.querySelector(selector);
  $('#btn-abrir-camara').addEventListener('click', abrirModalCamara);
  $('#btn-cerrar-camara').addEventListener('click', cerrarModalCamara);
  $('#btn-tomar-foto').addEventListener('click', tomarFotoDesdeCamara);
  $('#btn-terminar-captura').addEventListener('click', terminarCaptura);

  $('#btn-escaner-archivo').addEventListener('click', () => $('#input-escaner-archivo').click());
  $('#input-escaner-archivo').addEventListener('change', (e) => {
    if (e.target.files.length) {
      procesarArchivosSeleccionados(e.target.files);
      cambiarVista('subir');
      mostrarToast('Archivo(s) agregados.', 'exito');
    }
  });

  $('#btn-formato-jpg').addEventListener('click', () => elegirFormato('jpg'));
  $('#btn-formato-pdf').addEventListener('click', () => elegirFormato('pdf'));
  $('#btn-una-pagina').addEventListener('click', () => finalizarCapturaComoPdf(false));
  $('#btn-varias-paginas').addEventListener('click', () => finalizarCapturaComoPdf(true));
}

async function abrirModalCamara() {
  const $ = (selector) => document.querySelector(selector);
  capturasEscaner = [];
  $('#miniaturas-captura').innerHTML = '';
  $('#modal-camara').classList.remove('oculto');

  try {
    const dispositivos = await navigator.mediaDevices.enumerateDevices();
    const camaras = dispositivos.filter((d) => d.kind === 'videoinput');
    const select = $('#select-camara');
    select.innerHTML = '';
    let idCamaraPrincipal = null;

    camaras.forEach((cam, i) => {
      const opcion = document.createElement('option');
      opcion.value = cam.deviceId;
      opcion.textContent = cam.label || ('Cámara ' + (i + 1));
      select.appendChild(opcion);
      const etiquetaStr = (cam.label || '').toLowerCase();
      if (etiquetaStr.includes('back') || etiquetaStr.includes('environment') || etiquetaStr.includes('trasera')) {
        idCamaraPrincipal = cam.deviceId;
      }
    });

    if (!idCamaraPrincipal && camaras.length > 1) idCamaraPrincipal = camaras[camaras.length - 1].deviceId;
    else if (!idCamaraPrincipal && camaras.length === 1) idCamaraPrincipal = camaras[0].deviceId;

    if (idCamaraPrincipal) select.value = idCamaraPrincipal;
    select.addEventListener('change', () => iniciarStreamCamara(select.value));
    await iniciarStreamCamara(idCamaraPrincipal);
  } catch (e) { mostrarToast('No se pudo acceder a la cámara.', 'error'); }
}

async function iniciarStreamCamara(deviceId) {
  detenerStreamCamara();
  const restricciones = { video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' } };
  try {
      streamCamaraActual = await navigator.mediaDevices.getUserMedia(restricciones);
      document.querySelector('#video-escaner').srcObject = streamCamaraActual;
  } catch (err) { mostrarToast('Error al iniciar cámara', 'error'); }
}

function detenerStreamCamara() {
  if (streamCamaraActual) {
    streamCamaraActual.getTracks().forEach((t) => t.stop());
    streamCamaraActual = null;
  }
}

function cerrarModalCamara() {
  detenerStreamCamara();
  document.querySelector('#modal-camara').classList.add('oculto');
}

function tomarFotoDesdeCamara() {
  const video = document.querySelector('#video-escaner');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  capturasEscaner.push(dataUrl);

  const img = document.createElement('img');
  img.src = dataUrl;
  document.querySelector('#miniaturas-captura').appendChild(img);
}

function terminarCaptura() {
  if (capturasEscaner.length === 0) return mostrarToast('Toma al menos una foto', 'error');
  cerrarModalCamara();
  document.querySelector('#modal-formato').classList.remove('oculto');
}

function elegirFormato(formato) {
  formatoElegido = formato;
  document.querySelector('#modal-formato').classList.add('oculto');
  if (formato === 'jpg') guardarCapturasComoJpg();
  else {
    if (capturasEscaner.length > 1) document.querySelector('#modal-paginas').classList.remove('oculto');
    else finalizarCapturaComoPdf(false);
  }
}

function guardarCapturasComoJpg() {
  capturasEscaner.forEach((dataUrl, i) => {
    const base64 = dataUrl.split(',')[1];
    archivosEnCola.push({
      id: 'scan' + Date.now() + i, nombre: 'escaneo_' + Date.now() + '_' + (i + 1) + '.jpg',
      base64, mime: 'image/jpeg', peso: Math.round(base64.length * 0.75), estado: 'pendiente'
    });
  });
  finalizarFlujoEscaneo();
}

function finalizarCapturaComoPdf(variasPaginas) {
  document.querySelector('#modal-paginas').classList.add('oculto');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'pt' });
  const paginas = variasPaginas ? capturasEscaner : [capturasEscaner[0]];

  paginas.forEach((dataUrl, i) => {
    if (i > 0) pdf.addPage();
    const propiedades = pdf.getImageProperties(dataUrl);
    const anchoPagina = pdf.internal.pageSize.getWidth();
    const altoPagina = (propiedades.height * anchoPagina) / propiedades.width;
    pdf.addImage(dataUrl, 'JPEG', 0, 0, anchoPagina, altoPagina);
  });

  const base64Pdf = pdf.output('datauristring').split(',')[1];
  archivosEnCola.push({
    id: 'scanpdf' + Date.now(), nombre: 'escaneo_' + Date.now() + '.pdf',
    base64: base64Pdf, mime: 'application/pdf', peso: Math.round(base64Pdf.length * 0.75), estado: 'pendiente'
  });
  finalizarFlujoEscaneo();
}

function finalizarFlujoEscaneo() {
  capturasEscaner = [];
  cambiarVista('subir');
  renderizarListaArchivos();
  mostrarToast('Documento listo.', 'exito');
}

// MÓDULO PWA
let eventoInstalacion;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  eventoInstalacion = e;
  const btnInstalar = document.getElementById('btn-instalar-pwa');
  if (btnInstalar) {
    btnInstalar.classList.remove('oculto');
    btnInstalar.addEventListener('click', async () => {
      if (!eventoInstalacion) return;
      eventoInstalacion.prompt();
      const { outcome } = await eventoInstalacion.userChoice;
      if (outcome === 'accepted') btnInstalar.classList.add('oculto'); 
      eventoInstalacion = null;
    });
  }
});

window.addEventListener('appinstalled', () => {
  const btnInstalar = document.getElementById('btn-instalar-pwa');
  if (btnInstalar) btnInstalar.classList.add('oculto');
});
