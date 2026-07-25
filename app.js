/****************************************************************************************
 * SISTEMA DE ARCHIVO PERSONAL — COMPUKELC
 * app.js — lógica de frontend
 ****************************************************************************************/

// =========================================================================================
// 0. CONFIGURACIÓN — PEGA AQUÍ LA URL DE TU WEB APP DE APPS SCRIPT (termina en /exec)
// =========================================================================================
const URL_BACKEND = 'https://script.google.com/macros/s/AKfycbylGeZOzFB8PuaVHPS-eJat49vxwIM3kgUkWhORqpZsxcfciOh1xmAOXlEySkYtJaa2/exec';

// Claves usadas en localStorage
const LS = {
  TOKEN: 'archivo_personal_token',
  USUARIO_RECORDADO: 'archivo_personal_usuario_recordado',
  DATOS_USUARIO: 'archivo_personal_datos_usuario'
};

// Estado en memoria
let archivosEnCola = [];      // {id, file, nombre, base64, mime, peso, estado}
let cacheRegistro = [];       // registros completos ya traídos del backend
let streamCamaraActual = null;
let capturasEscaner = [];     // dataURLs capturados en la sesión de escaneo
let formatoElegido = null;    // 'jpg' | 'pdf'

// =========================================================================================
// 1. UTILIDADES GENERALES
// =========================================================================================
function $(selector) { return document.querySelector(selector); }
function $all(selector) { return Array.from(document.querySelectorAll(selector)); }

function mostrarToast(mensaje, tipo) {
  const toast = $('#toast');
  toast.textContent = mensaje;
  toast.className = 'mostrar ' + (tipo || '');
  setTimeout(() => { toast.className = ''; }, 3200);
}

function normalizarTexto(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quita tildes/diacríticos
}

function formatearPeso(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Llama al backend. Usamos 'text/plain' en el POST para evitar el preflight de CORS
// (Apps Script no responde bien a OPTIONS, así que esto es obligatorio).
async function llamarBackend(accion, datos) {
  const cuerpo = Object.assign({ action: accion }, datos || {});
  const respuesta = await fetch(URL_BACKEND, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(cuerpo)
  });
  if (!respuesta.ok) throw new Error('Error de red al contactar el servidor');
  return respuesta.json();
}

function obtenerToken() { return localStorage.getItem(LS.TOKEN); }

// =========================================================================================
// 2. SESIÓN Y LOGIN
// =========================================================================================
document.addEventListener('DOMContentLoaded', iniciarApp);

async function iniciarApp() {
  registrarServiceWorker();
  precargarUsuarioRecordado();
  configurarEventosLogin();
  configurarEventosApp();

  const token = obtenerToken();
  if (!token) { return mostrarLogin(); }

  try {
    const resp = await llamarBackend('validarSesion', { token });
    if (resp.ok) {
      mostrarApp();
    } else {
      localStorage.removeItem(LS.TOKEN);
      mostrarLogin();
    }
  } catch (e) {
    // Sin conexión: si ya había sesión guardada, dejamos entrar (modo tolerante)
    mostrarApp();
  }
}

function registrarServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function precargarUsuarioRecordado() {
  const usuarioGuardado = localStorage.getItem(LS.USUARIO_RECORDADO);
  if (usuarioGuardado) {
    $('#input-usuario').value = usuarioGuardado;
    $('#input-recordar').checked = true;
    $('#input-clave').focus();
  }
}

function configurarEventosLogin() {
  $('#btn-toggle-clave').addEventListener('click', () => {
    const input = $('#input-clave');
    const mostrando = input.type === 'text';
    input.type = mostrando ? 'password' : 'text';
  });

  $('#form-login').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const usuario = $('#input-usuario').value.trim();
    const clave = $('#input-clave').value;
    const recordar = $('#input-recordar').checked;
    const btn = $('#btn-login');
    const errorBox = $('#login-error');

    errorBox.classList.add('oculto');
    btn.disabled = true;
    btn.textContent = 'Verificando…';

    try {
      const resp = await llamarBackend('login', { usuario, clave });
      if (resp.ok) {
        localStorage.setItem(LS.TOKEN, resp.token);
        localStorage.setItem(LS.DATOS_USUARIO, JSON.stringify(resp.usuario));
        if (recordar) localStorage.setItem(LS.USUARIO_RECORDADO, usuario);
        else localStorage.removeItem(LS.USUARIO_RECORDADO);
        mostrarApp();
      } else {
        errorBox.textContent = resp.error || 'No se pudo iniciar sesión';
        errorBox.classList.remove('oculto');
      }
    } catch (e) {
      errorBox.textContent = 'No se pudo contactar el servidor. Revisa tu conexión.';
      errorBox.classList.remove('oculto');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Iniciar sesión';
    }
  });
}

function mostrarLogin() {
  $('#vista-login').classList.remove('oculto');
  $('#vista-app').classList.add('oculto');
}

function mostrarApp() {
  $('#vista-login').classList.add('oculto');
  $('#vista-app').classList.remove('oculto');

  const datosUsuario = JSON.parse(localStorage.getItem(LS.DATOS_USUARIO) || '{}');
  $('#chip-nombre').textContent = datosUsuario.nombre || datosUsuario.usuario || 'Usuario';
  $('#chip-cargo').textContent = datosUsuario.cargo || '';

  cargarCarpetasParaAutocompletar();
}

// IMPORTANTE: la sesión NUNCA se cierra sola. Solo el botón "Cerrar sesión" borra el token.
// Recargar la página, cerrar el navegador por error o perder la conexión no cierra sesión.
function configurarEventosApp() {
  $('#btn-logout').addEventListener('click', () => {
    localStorage.removeItem(LS.TOKEN);
    localStorage.removeItem(LS.DATOS_USUARIO);
    mostrarLogin();
  });

  $all('.nav-item').forEach((boton) => {
    boton.addEventListener('click', () => cambiarVista(boton.dataset.vista));
  });

  configurarEventosSubida();
  configurarEventosDocumentos();
  configurarEventosEscaner();
}

function cambiarVista(nombreVista) {
  $all('.nav-item').forEach((b) => b.classList.toggle('activo', b.dataset.vista === nombreVista));
  $all('.seccion').forEach((s) => s.classList.add('oculto'));
  $('#seccion-' + nombreVista).classList.remove('oculto');

  if (nombreVista === 'documentos' && cacheRegistro.length === 0) {
    cargarRegistroDocumentos();
  }
}

// =========================================================================================
// 3. SUBIDA DE ARCHIVOS (con compresión de imágenes vía Canvas)
// =========================================================================================
function configurarEventosSubida() {
  const dropzone = $('#dropzone');
  const inputArchivos = $('#input-archivos');

  dropzone.addEventListener('click', () => inputArchivos.click());
  inputArchivos.addEventListener('change', () => agregarArchivos(Array.from(inputArchivos.files)));

  ['dragover', 'dragenter'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('arrastrando'); });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('arrastrando'); });
  });
  dropzone.addEventListener('drop', (e) => {
    agregarArchivos(Array.from(e.dataTransfer.files));
  });

  $('#btn-subir').addEventListener('click', subirColaDeArchivos);
}

async function agregarArchivos(archivos) {
  if (!archivos.length) return;
  const dropzone = $('#dropzone');
  dropzone.classList.add('escaneando');

  for (const file of archivos) {
    const item = {
      id: 'f' + Date.now() + Math.random().toString(16).slice(2),
      file,
      nombre: file.name,
      pesoOriginal: file.size,
      estado: 'pendiente'
    };

    try {
      if (file.type.startsWith('image/')) {
        const { base64, mime, peso } = await comprimirImagen(file);
        item.base64 = base64;
        item.mime = mime;
        item.peso = peso;
      } else {
        item.base64 = await archivoABase64(file);
        item.mime = file.type || 'application/octet-stream';
        item.peso = file.size;
      }
      archivosEnCola.push(item);
    } catch (e) {
      mostrarToast('No se pudo procesar ' + file.name, 'error');
    }
  }

  dropzone.classList.remove('escaneando');
  renderizarListaArchivos();
}

// Reduce el peso de imágenes usando Canvas antes de enviarlas al servidor
function comprimirImagen(file, maxAncho = 1600, maxAlto = 1600, calidad = 0.78) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const escala = Math.min(1, maxAncho / width, maxAlto / height);
        width = Math.round(width * escala);
        height = Math.round(height * escala);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', calidad);
        const base64 = dataUrl.split(',')[1];
        const peso = Math.round(base64.length * 0.75); // tamaño aproximado en bytes
        resolve({ base64, mime: 'image/jpeg', peso });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    lector.onerror = reject;
    lector.readAsDataURL(file);
  });
}

function archivoABase64(file) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result.split(',')[1]);
    lector.onerror = reject;
    lector.readAsDataURL(file);
  });
}

function renderizarListaArchivos() {
  const contenedor = $('#lista-archivos');
  contenedor.innerHTML = '';

  archivosEnCola.forEach((item) => {
    const fila = document.createElement('div');
    fila.className = 'item-archivo';
    fila.innerHTML = `
      <span class="nombre">${item.nombre}</span>
      <span class="peso">${formatearPeso(item.peso || item.pesoOriginal)}</span>
      <span class="estado ${item.estado}">${etiquetaEstado(item.estado)}</span>
      <button class="btn-quitar" title="Quitar" data-id="${item.id}">✕</button>
    `;
    contenedor.appendChild(fila);
  });

  $all('.btn-quitar').forEach((btn) => {
    btn.addEventListener('click', () => {
      archivosEnCola = archivosEnCola.filter((a) => a.id !== btn.dataset.id);
      renderizarListaArchivos();
    });
  });

  $('#btn-subir').disabled = archivosEnCola.length === 0;
}

function etiquetaEstado(estado) {
  return { pendiente: 'Pendiente', subiendo: 'Subiendo…', listo: 'Subido', error: 'Error' }[estado] || estado;
}

async function subirColaDeArchivos() {
  const carpeta = $('#input-carpeta').value.trim();
  if (!carpeta) { mostrarToast('Escribe una carpeta de destino', 'error'); return; }
  if (archivosEnCola.length === 0) return;

  $('#btn-subir').disabled = true;
  $('#btn-subir').textContent = 'Subiendo…';

  for (const item of archivosEnCola) {
    if (item.estado === 'listo') continue;
    item.estado = 'subiendo';
    renderizarListaArchivos();
    try {
      const resp = await llamarBackend('subirArchivo', {
        token: obtenerToken(),
        nombreArchivo: item.nombre,
        tipoMime: item.mime,
        base64Data: item.base64,
        carpetaDestino: carpeta,
        tipoOrigen: 'Subida manual'
      });
      item.estado = resp.ok ? 'listo' : 'error';
      if (!resp.ok) mostrarToast(item.nombre + ': ' + resp.error, 'error');
    } catch (e) {
      item.estado = 'error';
      mostrarToast('Error de red subiendo ' + item.nombre, 'error');
    }
    renderizarListaArchivos();
  }

  $('#btn-subir').textContent = 'Subir a Drive';
  $('#btn-subir').disabled = false;

  const todosListos = archivosEnCola.every((a) => a.estado === 'listo');
  if (todosListos) {
    mostrarToast('Todos los archivos se subieron correctamente', 'exito');
    archivosEnCola = [];
    renderizarListaArchivos();
    cargarCarpetasParaAutocompletar(); // refresca por si se creó una carpeta nueva
  }
}

async function cargarCarpetasParaAutocompletar() {
  try {
    const resp = await llamarBackend('listarCarpetas', { token: obtenerToken() });
    if (!resp.ok) return;
    const datalist = $('#lista-carpetas');
    datalist.innerHTML = '';
    resp.carpetas.forEach((nombre) => {
      const opcion = document.createElement('option');
      opcion.value = nombre;
      datalist.appendChild(opcion);
    });
  } catch (e) { /* modo silencioso: la carpeta igual se puede escribir manualmente */ }
}

// =========================================================================================
// 4. MÓDULO DOCUMENTOS — filtros por fecha + búsqueda difusa
// =========================================================================================
function configurarEventosDocumentos() {
  ['#filtro-anio', '#filtro-mes', '#filtro-dia', '#filtro-texto'].forEach((sel) => {
    $(sel).addEventListener('input', renderizarTablaDocumentos);
    $(sel).addEventListener('change', renderizarTablaDocumentos);
  });
}

async function cargarRegistroDocumentos() {
  $('#documentos-vacio').textContent = 'Cargando documentos…';
  $('#documentos-vacio').classList.remove('oculto');
  $('#tabla-documentos').classList.add('oculto');

  try {
    const resp = await llamarBackend('obtenerRegistro', {
      token: obtenerToken(),
      filtros: { anio: 'todos', mes: 'todos', dia: 'todos' }
    });
    if (!resp.ok) { mostrarToast(resp.error, 'error'); return; }

    cacheRegistro = resp.registros;
    poblarSelectFiltro('#filtro-anio', resp.disponibles.anios, 'Año');
    poblarSelectFiltro('#filtro-mes', resp.disponibles.meses, 'Mes');
    poblarSelectFiltro('#filtro-dia', resp.disponibles.dias, 'Día');
    renderizarTablaDocumentos();
  } catch (e) {
    $('#documentos-vacio').textContent = 'No se pudo cargar el registro. Revisa tu conexión.';
  }
}

function poblarSelectFiltro(selector, valores, etiqueta) {
  const select = $(selector);
  select.innerHTML = `<option value="todos">${etiqueta}: todos</option>`;
  valores.forEach((v) => {
    const opcion = document.createElement('option');
    opcion.value = v;
    opcion.textContent = v;
    select.appendChild(opcion);
  });
}

function renderizarTablaDocumentos() {
  const anio = $('#filtro-anio').value;
  const mes = $('#filtro-mes').value;
  const dia = $('#filtro-dia').value;
  const textoBusqueda = normalizarTexto($('#filtro-texto').value);

  const filtrados = cacheRegistro.filter((r) => {
    const [a, m, d] = r.fecha.split('-');
    if (anio !== 'todos' && a !== anio) return false;
    if (mes !== 'todos' && m !== mes) return false;
    if (dia !== 'todos' && d !== dia) return false;

    if (textoBusqueda) {
      const objetivo = normalizarTexto(r.nombreArchivo + ' ' + r.carpetaDestino);
      if (!objetivo.includes(textoBusqueda)) return false;
    }
    return true;
  });

  const cuerpo = $('#cuerpo-documentos');
  cuerpo.innerHTML = '';

  if (filtrados.length === 0) {
    $('#tabla-documentos').classList.add('oculto');
    $('#documentos-vacio').textContent = 'No hay documentos que coincidan con el filtro.';
    $('#documentos-vacio').classList.remove('oculto');
    return;
  }

  $('#documentos-vacio').classList.add('oculto');
  $('#tabla-documentos').classList.remove('oculto');

  filtrados
    .sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora))
    .forEach((r) => {
      const fila = document.createElement('tr');
      fila.innerHTML = `
        <td><a href="${r.url}" target="_blank" rel="noopener">${r.nombreArchivo}</a></td>
        <td>${r.carpetaDestino}</td>
        <td class="fecha-mono">${r.fecha}</td>
        <td class="fecha-mono">${r.hora}</td>
        <td>${r.tipo || ''}</td>
      `;
      cuerpo.appendChild(fila);
    });
}

// =========================================================================================
// 5. MÓDULO ESCÁNER — cámara (móvil/webcam de PC) + generación de PDF multipágina
// =========================================================================================
function configurarEventosEscaner() {
  $('#btn-abrir-camara').addEventListener('click', abrirModalCamara);
  $('#btn-cerrar-camara').addEventListener('click', cerrarModalCamara);
  $('#btn-tomar-foto').addEventListener('click', tomarFotoDesdeCamara);
  $('#btn-terminar-captura').addEventListener('click', terminarCaptura);

  $('#btn-escaner-archivo').addEventListener('click', () => $('#input-escaner-archivo').click());
  $('#input-escaner-archivo').addEventListener('change', (e) => {
    agregarArchivos(Array.from(e.target.files));
    cambiarVista('subir');
    mostrarToast('Archivo(s) del escáner agregados. Elige carpeta y sube.', 'exito');
  });

  $('#btn-formato-jpg').addEventListener('click', () => elegirFormato('jpg'));
  $('#btn-formato-pdf').addEventListener('click', () => elegirFormato('pdf'));
  $('#btn-una-pagina').addEventListener('click', () => finalizarCapturaComoPdf(false));
  $('#btn-varias-paginas').addEventListener('click', () => finalizarCapturaComoPdf(true));
}

async function abrirModalCamara() {
  capturasEscaner = [];
  $('#miniaturas-captura').innerHTML = '';
  $('#modal-camara').classList.remove('oculto');

  try {
    // En computadores, si hay un escáner conectado que se comporte como cámara UVC,
    // aparecerá en esta lista de dispositivos de video.
    const dispositivos = await navigator.mediaDevices.enumerateDevices();
    const camaras = dispositivos.filter((d) => d.kind === 'videoinput');
    const select = $('#select-camara');
    select.innerHTML = '';
    camaras.forEach((cam, i) => {
      const opcion = document.createElement('option');
      opcion.value = cam.deviceId;
      opcion.textContent = cam.label || ('Dispositivo de captura ' + (i + 1));
      select.appendChild(opcion);
    });
    select.addEventListener('change', () => iniciarStreamCamara(select.value));

    await iniciarStreamCamara(camaras[0] ? camaras[0].deviceId : undefined);
  } catch (e) {
    mostrarToast('No se pudo acceder a la cámara. Usa "Cargar desde software del escáner".', 'error');
  }
}

async function iniciarStreamCamara(deviceId) {
  detenerStreamCamara();
  const restricciones = {
    video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }
  };
  streamCamaraActual = await navigator.mediaDevices.getUserMedia(restricciones);
  $('#video-escaner').srcObject = streamCamaraActual;
}

function detenerStreamCamara() {
  if (streamCamaraActual) {
    streamCamaraActual.getTracks().forEach((t) => t.stop());
    streamCamaraActual = null;
  }
}

function cerrarModalCamara() {
  detenerStreamCamara();
  $('#modal-camara').classList.add('oculto');
}

function tomarFotoDesdeCamara() {
  const video = $('#video-escaner');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  capturasEscaner.push(dataUrl);

  const img = document.createElement('img');
  img.src = dataUrl;
  $('#miniaturas-captura').appendChild(img);
}

function terminarCaptura() {
  if (capturasEscaner.length === 0) {
    mostrarToast('Toma al menos una foto antes de continuar', 'error');
    return;
  }
  cerrarModalCamara();
  $('#modal-formato').classList.remove('oculto');
}

function elegirFormato(formato) {
  formatoElegido = formato;
  $('#modal-formato').classList.add('oculto');

  if (formato === 'jpg') {
    guardarCapturasComoJpg();
  } else {
    // Si solo hay una foto, no tiene sentido preguntar "una o varias": se asume una.
    if (capturasEscaner.length > 1) {
      $('#modal-paginas').classList.remove('oculto');
    } else {
      finalizarCapturaComoPdf(false);
    }
  }
}

function guardarCapturasComoJpg() {
  capturasEscaner.forEach((dataUrl, i) => {
    const base64 = dataUrl.split(',')[1];
    archivosEnCola.push({
      id: 'scan' + Date.now() + i,
      nombre: 'escaneo_' + Date.now() + '_' + (i + 1) + '.jpg',
      base64,
      mime: 'image/jpeg',
      peso: Math.round(base64.length * 0.75),
      estado: 'pendiente'
    });
  });
  finalizarFlujoEscaneo();
}

function finalizarCapturaComoPdf(variasPaginas) {
  $('#modal-paginas').classList.add('oculto');
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
    id: 'scanpdf' + Date.now(),
    nombre: 'escaneo_' + Date.now() + '.pdf',
    base64: base64Pdf,
    mime: 'application/pdf',
    peso: Math.round(base64Pdf.length * 0.75),
    estado: 'pendiente'
  });

  finalizarFlujoEscaneo();
}

function finalizarFlujoEscaneo() {
  capturasEscaner = [];
  cambiarVista('subir');
  renderizarListaArchivos();
  mostrarToast('Documento escaneado agregado. Elige carpeta y sube.', 'exito');
}
