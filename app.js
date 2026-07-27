// =========================================================================================
// SISTEMA DE ARCHIVO PERSONAL — compukelc
// ARCHIVO COMPLETO: app.js (Incluye Auto-Login y Módulo Escáner)
// =========================================================================================
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbylGeZOzFB8PuaVHPS-eJat49vxwIM3kgUkWhORqpZsxcfciOh1xmAOXlEySkYtJaa2/exec'; // <-- Pega aquí tu URL (termina en /exec)
let tokenSesion = localStorage.getItem('compukelc_token') || null;

// Variables globales
let capturasEscaner = [];
let streamCamaraActual = null;
let formatoElegido = 'pdf';
let archivosEnCola = [];

// Utilidades DOM
const $ = (selector) => document.querySelector(selector);
const mostrarToast = (mensaje, tipo = 'exito') => {
  const toast = $('#toast');
  if(!toast) return;
  toast.textContent = mensaje;
  toast.className = '';
  toast.classList.add('mostrar', tipo);
  setTimeout(() => toast.classList.remove('mostrar', tipo), 3500);
};

const cambiarVista = (vistaId) => {
  document.querySelectorAll('.seccion').forEach(s => s.classList.add('oculto'));
  const target = $('#seccion-' + vistaId);
  if (target) target.classList.remove('oculto');
  
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('activo'));
  const btnActivo = document.querySelector(`.nav-item[data-vista="${vistaId}"]`);
  if (btnActivo) btnActivo.classList.add('activo');
};

document.addEventListener('DOMContentLoaded', () => {
  
  // ---------------------------------------------------------------------------------------
  // 1. AUTO-LOGIN: Mantener sesión activa al presionar F5
  // ---------------------------------------------------------------------------------------
  if (tokenSesion) {
    const btnLogin = $('#btn-login');
    if (btnLogin) {
      btnLogin.disabled = true;
      btnLogin.textContent = 'Restaurando sesión...';
    }
    
    fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'validarSesion', token: tokenSesion })
    })
    .then(res => res.json())
    .then(data => {
      if (data.ok) {
        // Token válido, saltar al dashboard
        $('#vista-login').classList.add('oculto');
        $('#vista-app').classList.remove('oculto');
        
        $('#chip-nombre').textContent = localStorage.getItem('usuario_nombre') || data.usuario;
        $('#chip-cargo').textContent = localStorage.getItem('usuario_cargo') || 'Usuario';
        
        cargarDocumentos(); // Cargar los documentos automáticamente
      } else {
        localStorage.removeItem('compukelc_token');
        tokenSesion = null;
      }
    })
    .catch(err => console.error("Error restaurando sesión:", err))
    .finally(() => {
      if (btnLogin) {
        btnLogin.disabled = false;
        btnLogin.textContent = 'Iniciar sesión';
      }
    });
  }

  // ---------------------------------------------------------------------------------------
  // 2. MÓDULO LOGIN Y NAVEGACIÓN
  // ---------------------------------------------------------------------------------------
  
  // Visualizar contraseña
  const btnToggleClave = document.getElementById('btn-toggle-clave');
  const inputClave = document.getElementById('input-clave');
  
  if (btnToggleClave && inputClave) {
    btnToggleClave.addEventListener('click', function() {
      inputClave.type = inputClave.type === 'password' ? 'text' : 'password';
    });
  }

  // Formulario Login
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', async function(e) {
      e.preventDefault(); 
      
      const usuario = document.getElementById('input-usuario').value;
      const clave = inputClave.value;
      const errorDiv = document.getElementById('login-error');
      const btnLogin = document.getElementById('btn-login');
      
      errorDiv.classList.add('oculto');
      btnLogin.disabled = true;
      btnLogin.textContent = 'Verificando credenciales...';
      
      try {
        const respuesta = await fetch(SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'login', usuario: usuario, clave: clave })
        });
        
        const resultado = await respuesta.json();
        
        if (resultado.ok) {
          $('#vista-login').classList.add('oculto');
          $('#vista-app').classList.remove('oculto');
          
          $('#chip-nombre').textContent = resultado.usuario.nombre;
          $('#chip-cargo').textContent = resultado.usuario.cargo;
          
          tokenSesion = resultado.token;
          
          // Guardar siempre el token y los datos de interfaz para el F5
          localStorage.setItem('compukelc_token', tokenSesion);
          localStorage.setItem('usuario_nombre', resultado.usuario.nombre);
          localStorage.setItem('usuario_cargo', resultado.usuario.cargo);
          
          // Recordar usuario en el input si está marcado
          if ($('#input-recordar').checked) {
            localStorage.setItem('usuario_guardado', usuario);
          } else {
            localStorage.removeItem('usuario_guardado');
          }
        } else {
          errorDiv.textContent = resultado.error;
          errorDiv.classList.remove('oculto');
        }
      } catch (error) {
        errorDiv.textContent = 'Fallo de conexión con el servidor.';
        errorDiv.classList.remove('oculto');
      } finally {
        btnLogin.disabled = false;
        btnLogin.textContent = 'Iniciar sesión';
      }
    });
  }

  // Autocompletado de usuario guardado
  const usuarioGuardado = localStorage.getItem('usuario_guardado');
  if (usuarioGuardado) {
    $('#input-usuario').value = usuarioGuardado;
    $('#input-recordar').checked = true;
  }
  
  // Navegación Lateral
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const vista = btn.dataset.vista;
      if (vista) {
        cambiarVista(vista);
        if (vista === 'documentos') cargarDocumentos();
        if (vista === 'subir') cargarCarpetas();
      }
    });
  });

  // Cerrar Sesión
  const btnLogout = $('#btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('compukelc_token');
      localStorage.removeItem('usuario_nombre');
      localStorage.removeItem('usuario_cargo');
      tokenSesion = null;
      $('#vista-app').classList.add('oculto');
      $('#vista-login').classList.remove('oculto');
      $('#input-clave').value = '';
    });
  }

  // Inicializar sub-módulos
  configurarEventosEscaner();
  configurarEventosSubida();
  
  // Listeners de Filtros de Documentos
  $('#filtro-anio')?.addEventListener('change', cargarDocumentos);
  $('#filtro-mes')?.addEventListener('change', cargarDocumentos);
  $('#filtro-dia')?.addEventListener('change', cargarDocumentos);
  
  $('#filtro-texto')?.addEventListener('input', function(e) {
    const texto = e.target.value.toLowerCase().trim();
    const filas = document.querySelectorAll('#cuerpo-documentos tr');
    filas.forEach(fila => {
      const nombre = fila.cells[0].textContent.toLowerCase();
      const carpeta = fila.cells[1].textContent.toLowerCase();
      fila.style.display = (nombre.includes(texto) || carpeta.includes(texto)) ? '' : 'none';
    });
  });
});

// ---------------------------------------------------------------------------------------
// 3. MÓDULO DE DOCUMENTOS (TABLA)
// ---------------------------------------------------------------------------------------

async function cargarDocumentos() {
  const tbody = $('#cuerpo-documentos');
  const vacio = $('#documentos-vacio');
  const tabla = $('#tabla-documentos');

  if (!tokenSesion) return;

  vacio.textContent = 'Cargando documentos...';
  vacio.classList.remove('oculto');
  tabla.classList.add('oculto');
  tbody.innerHTML = '';

  try {
    const respuesta = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'obtenerRegistro',
        token: tokenSesion,
        filtros: {
          anio: $('#filtro-anio').value,
          mes: $('#filtro-mes').value,
          dia: $('#filtro-dia').value
        }
      })
    });

    const resultado = await respuesta.json();

    if (resultado.ok) {
      if (resultado.registros.length === 0) {
        vacio.textContent = 'No hay documentos registrados o que coincidan con los filtros.';
      } else {
        resultado.registros.reverse().forEach(reg => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><a href="${reg.url}" target="_blank" rel="noopener noreferrer">${reg.nombreArchivo}</a></td>
            <td>${reg.carpetaDestino}</td>
            <td class="fecha-mono">${reg.fecha}</td>
            <td class="fecha-mono">${reg.hora}</td>
            <td><span class="estado listo">${reg.tipo}</span></td>
          `;
          tbody.appendChild(tr);
        });
        vacio.classList.add('oculto');
        tabla.classList.remove('oculto');
      }
      actualizarFiltros(resultado.disponibles);
    } else {
      vacio.textContent = 'Error: ' + resultado.error;
      if (resultado.error.includes('expirada') || resultado.error.includes('Token')) {
        $('#btn-logout').click();
      }
    }
  } catch (error) {
    vacio.textContent = 'Error de conexión al cargar los documentos.';
  }
}

function actualizarFiltros(disponibles) {
  const selectAnio = $('#filtro-anio');
  const selectMes = $('#filtro-mes');
  const selectDia = $('#filtro-dia');

  if (selectAnio.options.length <= 1) disponibles.anios.forEach(a => selectAnio.add(new Option(a, a)));
  if (selectMes.options.length <= 1) disponibles.meses.forEach(m => selectMes.add(new Option(m, m)));
  if (selectDia.options.length <= 1) disponibles.dias.forEach(d => selectDia.add(new Option(d, d)));
}


// ---------------------------------------------------------------------------------------
// 4. MÓDULO DE SUBIDA DE ARCHIVOS
// ---------------------------------------------------------------------------------------

function configurarEventosSubida() {
  const dropzone = $('#dropzone');
  const inputArchivos = $('#input-archivos');
  const btnSubir = $('#btn-subir');
  
  if(!dropzone) return;

  dropzone.addEventListener('click', () => inputArchivos.click());
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('arrastrando');
  });
  
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('arrastrando'));
  
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('arrastrando');
    procesarArchivosSeleccionados(e.dataTransfer.files);
  });

  inputArchivos.addEventListener('change', (e) => procesarArchivosSeleccionados(e.target.files));
  
  btnSubir.addEventListener('click', subirArchivosADrive);
}

async function cargarCarpetas() {
  if (!tokenSesion) return;
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'listarCarpetas', token: tokenSesion })
    });
    const data = await res.json();
    if (data.ok) {
      const datalist = $('#lista-carpetas');
      datalist.innerHTML = '';
      data.carpetas.forEach(c => {
        const option = document.createElement('option');
        option.value = c;
        datalist.appendChild(option);
      });
    }
  } catch (e) {
    console.error("Error al cargar carpetas", e);
  }
}

function procesarArchivosSeleccionados(files) {
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1];
      archivosEnCola.push({
        id: 'file_' + Date.now() + Math.random(),
        nombre: file.name,
        mime: file.type,
        base64: base64,
        peso: file.size,
        estado: 'pendiente'
      });
      renderizarListaArchivos();
    };
    reader.readAsDataURL(file);
  });
}

function renderizarListaArchivos() {
  const lista = $('#lista-archivos');
  lista.innerHTML = '';
  
  archivosEnCola.forEach(arch => {
    const div = document.createElement('div');
    div.className = 'item-archivo';
    div.innerHTML = `
      <span class="nombre">${arch.nombre}</span>
      <span class="peso">${(arch.peso / 1024).toFixed(1)} KB</span>
      <span class="estado ${arch.estado}" id="estado-${arch.id}">${arch.estado}</span>
      <button class="btn-quitar" onclick="quitarArchivo('${arch.id}')">✕</button>
    `;
    lista.appendChild(div);
  });
  
  $('#btn-subir').disabled = archivosEnCola.length === 0;
}

window.quitarArchivo = function(id) {
  archivosEnCola = archivosEnCola.filter(a => a.id !== id);
  renderizarListaArchivos();
}

async function subirArchivosADrive() {
  const carpetaDestino = $('#input-carpeta').value.trim();
  if (!carpetaDestino) {
    mostrarToast('Debes indicar una carpeta de destino.', 'error');
    return;
  }

  $('#btn-subir').disabled = true;

  for (let arch of archivosEnCola) {
    if (arch.estado === 'listo') continue;
    
    document.getElementById(`estado-${arch.id}`).textContent = 'subiendo...';
    document.getElementById(`estado-${arch.id}`).className = 'estado subiendo';
    
    try {
      const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'subirArchivo',
          token: tokenSesion,
          nombreArchivo: arch.nombre,
          carpetaDestino: carpetaDestino,
          base64Data: arch.base64,
          tipoMime: arch.mime,
          tipoOrigen: 'Subida manual'
        })
      });
      
      const data = await res.json();
      if (data.ok) {
        arch.estado = 'listo';
        document.getElementById(`estado-${arch.id}`).textContent = 'listo';
        document.getElementById(`estado-${arch.id}`).className = 'estado listo';
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      arch.estado = 'error';
      document.getElementById(`estado-${arch.id}`).textContent = 'error';
      document.getElementById(`estado-${arch.id}`).className = 'estado error';
      mostrarToast('Error al subir: ' + arch.nombre, 'error');
    }
  }
  
  setTimeout(() => {
    archivosEnCola = archivosEnCola.filter(a => a.estado !== 'listo');
    renderizarListaArchivos();
    $('#input-carpeta').value = '';
  }, 2000);
}


// ---------------------------------------------------------------------------------------
// 5. MÓDULO ESCÁNER (CÁMARA Y PDF)
// ---------------------------------------------------------------------------------------

function configurarEventosEscaner() {
  $('#btn-abrir-camara')?.addEventListener('click', abrirModalCamara);
  $('#btn-cerrar-camara')?.addEventListener('click', cerrarModalCamara);
  $('#btn-tomar-foto')?.addEventListener('click', tomarFotoDesdeCamara);
  $('#btn-terminar-captura')?.addEventListener('click', terminarCaptura);

  $('#btn-escaner-archivo')?.addEventListener('click', () => $('#input-escaner-archivo').click());
  $('#input-escaner-archivo')?.addEventListener('change', (e) => {
    procesarArchivosSeleccionados(e.target.files);
    cambiarVista('subir');
    mostrarToast('Archivo(s) del escáner agregados. Elige carpeta y sube.', 'exito');
  });

  $('#btn-formato-jpg')?.addEventListener('click', () => elegirFormato('jpg'));
  $('#btn-formato-pdf')?.addEventListener('click', () => elegirFormato('pdf'));
  $('#btn-una-pagina')?.addEventListener('click', () => finalizarCapturaComoPdf(false));
  $('#btn-varias-paginas')?.addEventListener('click', () => finalizarCapturaComoPdf(true));
}

async function abrirModalCamara() {
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
    mostrarToast('No se pudo acceder a la cámara. Usa "Cargar desde software del escáner".', 'error');
  }
}

async function iniciarStreamCamara(deviceId) {
  detenerStreamCamara();
  const restricciones = {
    video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }
  };
  try {
      streamCamaraActual = await navigator.mediaDevices.getUserMedia(restricciones);
      $('#video-escaner').srcObject = streamCamaraActual;
  } catch (err) {
      mostrarToast('Error al iniciar cámara seleccionada', 'error');
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
      id: 'scan_' + Date.now() + i,
      nombre: 'escaneo_' + Date.now() + '_' + (i + 1) + '.jpg',
      base64: base64,
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
    id: 'scanpdf_' + Date.now(),
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
