// =========================================================================================
// VARIABLES GLOBALES
// =========================================================================================
let capturasEscaner = [];
let streamCamaraActual = null;
let formatoElegido = 'pdf';
let archivosEnCola = [];
const GOOGLE_APP_URL = 'https://script.google.com/macros/s/AKfycbylGeZOzFB8PuaVHPS-eJat49vxwIM3kgUkWhORqpZsxcfciOh1xmAOXlEySkYtJaa2/exec'; 

// =========================================================================================
// ENLACE A MATRIZ CENTRAL (SISTEMA DE CONTROL)
// =========================================================================================
// REEMPLAZA esto con la URL publicada (App Web) de tu Dashboard Central
const URL_SISTEMA_CENTRAL = 'https://script.google.com/macros/s/TU_SCRIPT_ID_CENTRAL/exec'; 
const ID_INSTANCIA_ARCHIVO = 'ARC-001'; // Debe coincidir con el ID registrado en la matriz

async function sincronizarConMatriz() {
  try {
    // 1. Inyección de Publicidad y Avisos
    const resAviso = await fetch(`${URL_SISTEMA_CENTRAL}?api=true&accion=obtenerAviso&idEmpresa=${ID_INSTANCIA_ARCHIVO}`);
    const dataAviso = await resAviso.json();

    if (dataAviso && dataAviso.activo) {
      inyectarAvisoGlobal(dataAviso);
    }

    // 2. Candado de Seguridad (Verificación de Estado)
    const resEstado = await fetch(`${URL_SISTEMA_CENTRAL}?api=true&idEmpresa=${ID_INSTANCIA_ARCHIVO}`);
    const dataEstado = await resEstado.json();

    if (dataEstado && dataEstado.estado) {
      const estadoActual = dataEstado.estado.toString().toUpperCase();
      if (estadoActual === 'INACTIVO' || estadoActual === 'MANTENIMIENTO') {
        bloquearSistemaPorMatriz(estadoActual, dataEstado.alerta);
      }
    }
  } catch (error) {
    console.warn('Sincronización con la Matriz Central fallida:', error);
  }
}

function inyectarAvisoGlobal(aviso) {
  const banner = document.createElement('div');
  banner.style.background = aviso.color || '#d94a38'; 
  banner.style.color = '#fff';
  banner.style.padding = '12px 24px';
  banner.style.textAlign = 'center';
  banner.style.fontFamily = 'var(--font-body, sans-serif)';
  banner.style.fontSize = '14px';
  banner.style.zIndex = '9999';
  banner.style.position = 'relative';
  banner.style.display = 'flex';
  banner.style.justifyContent = 'center';
  banner.style.alignItems = 'center';
  banner.style.gap = '15px';
  banner.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  
  let htmlContent = `<span><strong>${aviso.titulo}:</strong> ${aviso.mensaje}</span>`;
  
  if (aviso.url) {
    htmlContent += `<a href="${aviso.url}" target="_blank" style="color: #fff; text-decoration: none; background: rgba(0,0,0,0.25); padding: 5px 12px; border-radius: 6px; font-weight: 600; font-size: 12px; transition: 0.2s;">Ver detalles</a>`;
  }
  
  banner.innerHTML = htmlContent;
  document.body.insertBefore(banner, document.body.firstChild);
}

function bloquearSistemaPorMatriz(estado, mensajePersonalizado) {
  let mensaje = mensajePersonalizado || (estado === 'MANTENIMIENTO' 
    ? 'Este sistema se encuentra actualmente en mantenimiento programado. Intente más tarde.' 
    : 'Acceso denegado. La instancia ha sido desactivada desde la Matriz Central.');

  // Sobrescribe todo el HTML de la página instantáneamente
  document.body.innerHTML = `
    <div style="height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #0B0F17; color: #E7ECF3; font-family: 'Inter', sans-serif; text-align: center; padding: 30px;">
        <h1 style="color: #F45B69; margin-bottom: 15px; font-family: 'Space Grotesk', sans-serif; text-transform: uppercase;">${estado}</h1>
        <p style="color: #8A96AC; max-width: 400px; line-height: 1.5;">${mensaje}</p>
        <div style="margin-top: 40px; border-top: 1px dashed #29344A; padding-top: 20px;">
            <p style="font-size: 12px; color: #4C8BF5; margin: 0; font-weight: 600;">SISTEMA CENTRAL DE CONTROL</p>
            <p style="font-size: 11px; color: #8A96AC; margin-top: 5px;">compukelc</p>
        </div>
    </div>
  `;
}

// =========================================================================================
// INICIALIZACIÓN
// =========================================================================================
document.addEventListener('DOMContentLoaded', () => {
  sincronizarConMatriz();
  
  configurarEventosLogin();
  configurarEventosNavegacion();
  configurarEventosSubida(); 
  configurarEventosEscaner();
  
  // Si ya hay sesión al recargar la página, cargar carpetas
  const token = localStorage.getItem('compukelc_token') || sessionStorage.getItem('compukelc_token');
  if (token) {
    cargarCarpetas(token);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('Service Worker registrado'))
      .catch(err => console.log('Error en Service Worker:', err));
  }
});

// =========================================================================================
// MÓDULO INTERFAZ — Login y Visor de contraseñas
// =========================================================================================
function configurarEventosLogin() {
  const btnToggleClave = document.getElementById('btn-toggle-clave');
  const inputClave = document.getElementById('input-clave');
  const formLogin = document.getElementById('form-login');
  
  if (btnToggleClave && inputClave) {
    btnToggleClave.addEventListener('click', () => {
      const esPassword = inputClave.getAttribute('type') === 'password';
      inputClave.setAttribute('type', esPassword ? 'text' : 'password');
      
      if (esPassword) {
        btnToggleClave.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>`;
      } else {
        btnToggleClave.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
      }
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
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('compukelc_token');
      sessionStorage.removeItem('compukelc_token');
      window.location.reload();
    });
  }
}

// =========================================================================================
// NAVEGACIÓN Y UTILIDADES UI
// =========================================================================================
function configurarEventosNavegacion() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      navItems.forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');
      cambiarVista(btn.dataset.vista);
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

// =========================================================================================
// MÓDULO SUBIDA DE ARCHIVOS
// =========================================================================================
function configurarEventosSubida() {
  const dropzone = document.getElementById('dropzone');
  const inputArchivos = document.getElementById('input-archivos');
  const btnSubir = document.getElementById('btn-subir');

  if (!dropzone || !inputArchivos || !btnSubir) return;

  dropzone.addEventListener('click', () => inputArchivos.click());
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('arrastrando');
  });
  
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
      ${archivo.estado === 'pendiente' || archivo.estado === 'error' 
        ? `<button class="btn-quitar" onclick="quitarArchivo(${index})">✕</button>` 
        : ''}
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
          action: 'subirArchivo',
          token: token,
          nombreArchivo: archivo.nombre,
          base64Data: archivo.base64,
          carpetaDestino: carpeta,
          tipoMime: archivo.mime,
          tipoOrigen: 'Subida manual'
        })
      });
      
      const datos = await res.json();
      
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
    setTimeout(() => {
      archivosEnCola = [];
      renderizarListaArchivos();
    }, 2000);
  }
}

async function cargarCarpetas(token) {
  try {
    const res = await fetch(GOOGLE_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'listarCarpetas', token: token })
    });
    const datos = await res.json();
    
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
  } catch (error) {
    console.error('No se pudieron cargar las sugerencias de carpetas.');
  }
}

// =========================================================================================
// MÓDULO ESCÁNER — cámara y PDF
// =========================================================================================
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
      mostrarToast('Archivo(s) agregados a la cola.', 'exito');
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

    if (!idCamaraPrincipal && camaras.length > 1) {
        idCamaraPrincipal = camaras[camaras.length - 1].deviceId;
    } else if (!idCamaraPrincipal && camaras.length === 1) {
        idCamaraPrincipal = camaras[0].deviceId;
    }

    if (idCamaraPrincipal) select.value = idCamaraPrincipal;

    select.addEventListener('change', () => iniciarStreamCamara(select.value));
    await iniciarStreamCamara(idCamaraPrincipal);
  } catch (e) {
    mostrarToast('No se pudo acceder a la cámara.', 'error');
  }
}

async function iniciarStreamCamara(deviceId) {
  detenerStreamCamara();
  const restricciones = {
    video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }
  };
  try {
      streamCamaraActual = await navigator.mediaDevices.getUserMedia(restricciones);
      document.querySelector('#video-escaner').srcObject = streamCamaraActual;
  } catch (err) {
      mostrarToast('Error al iniciar cámara', 'error');
  }
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
  if (capturasEscaner.length === 0) {
    mostrarToast('Toma al menos una foto antes de continuar', 'error');
    return;
  }
  cerrarModalCamara();
  document.querySelector('#modal-formato').classList.remove('oculto');
}

function elegirFormato(formato) {
  formatoElegido = formato;
  document.querySelector('#modal-formato').classList.add('oculto');

  if (formato === 'jpg') {
    guardarCapturasComoJpg();
  } else {
    if (capturasEscaner.length > 1) {
      document.querySelector('#modal-paginas').classList.remove('oculto');
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
  mostrarToast('Documento escaneado listo para subir.', 'exito');
}

// =========================================================================================
// MÓDULO PWA — INSTALACIÓN Y EVENTOS
// =========================================================================================
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
      if (outcome === 'accepted') {
        console.log('El usuario instaló la aplicación con éxito');
        btnInstalar.classList.add('oculto'); 
      }
      
      eventoInstalacion = null;
    });
  }
});

window.addEventListener('appinstalled', () => {
  const btnInstalar = document.getElementById('btn-instalar-pwa');
  if (btnInstalar) btnInstalar.classList.add('oculto');
});
