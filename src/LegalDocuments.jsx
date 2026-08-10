import React, { useState } from "react";

// ── Fuente única de verdad para las versiones legales vigentes ──────────
// AuthGate.jsx y CLEO.jsx SIEMPRE deben importar estas constantes de aquí,
// nunca escribir "1.0" a mano en ningún otro archivo , cambiar cualquiera
// de estos 2 valores es lo único que se necesita para que todo el sistema
// vuelva a exigir una nueva aceptación.
export const PRIVACY_VERSION = "1.0";
export const TERMS_VERSION = "1.0";
export const LEGAL_FECHA_VIGENCIA = "9 de agosto de 2026";
export const LEGAL_CONTACTO = "soporte@concleo.com";

var COLORS = {
  bg: "#F7F7FB",
  surface: "#FFFFFF",
  border: "#E7E7F1",
  text: "#15122B",
  textMuted: "#4B4968",
  textDim: "#9C9AB0",
  purple: "#4B5EFC",
  purplePale: "rgba(75,94,252,0.08)",
};

// ── Bloques de texto reutilizables (nunca HTML crudo, solo React) ──────
function P(props) {
  return (
    <p style={{ fontSize: 14, lineHeight: 1.65, color: COLORS.textMuted, margin: "0 0 12px" }}>
      {props.children}
    </p>
  );
}
function H(props) {
  return (
    <h3 style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, margin: "22px 0 8px" }}>
      {props.children}
    </h3>
  );
}
function Ul(props) {
  return (
    <ul style={{ margin: "0 0 12px", paddingLeft: 20 }}>
      {props.items.map(function (it, i) {
        return (
          <li key={i} style={{ fontSize: 14, lineHeight: 1.65, color: COLORS.textMuted, marginBottom: 4 }}>
            {it}
          </li>
        );
      })}
    </ul>
  );
}

// ── AVISO DE PRIVACIDAD INTEGRAL DE CLEO ────────────────────────────────
function AvisoPrivacidadContenido() {
  return (
    <div>
      <P>
        <strong>Versión 1.0</strong>
        <br />
        Fecha de entrada en vigor: {LEGAL_FECHA_VIGENCIA}
      </P>

      <H>1. Identidad y domicilio de la responsable</H>
      <P>
        Danna Ivette Acuña Beltrán, operadora de la plataforma digital CLEO, con domicilio en Calle 36
        número 245 entre 29 y 33, colonia Francisco de Montejo, C.P. 97203, Mérida, Yucatán, México, es
        responsable del tratamiento de los datos personales recabados a través de CLEO.
      </P>
      <P>
        Para cualquier asunto relacionado con este Aviso de Privacidad o con el tratamiento de datos
        personales, puede escribir a: <strong>{LEGAL_CONTACTO}</strong>
      </P>

      <H>2. Alcance del aviso</H>
      <P>
        Este Aviso de Privacidad aplica a las personas que crean una cuenta, inician sesión o utilizan
        CLEO, incluyendo sus modalidades de prueba, demostración y beta.
      </P>
      <P>
        CLEO está dirigido exclusivamente a personas mayores de 18 años. No solicitamos intencionalmente
        información de menores de edad. Si se detecta que una cuenta pertenece a una persona menor de 18
        años, podremos restringir o eliminar la cuenta y sus datos.
      </P>

      <H>3. Datos personales que podemos tratar</H>
      <P>
        Dependiendo del uso que la persona haga de CLEO, podremos tratar las siguientes categorías de
        información:
      </P>
      <P><strong>a) Datos de identificación y contacto</strong></P>
      <Ul
        items={[
          "Nombre.",
          "Dirección de correo electrónico.",
          "Número telefónico, cuando la persona decida proporcionarlo.",
          "Identificadores técnicos de la cuenta.",
          "Información proporcionada mediante el inicio de sesión con Google.",
        ]}
      />
      <P>
        Cuando se utiliza Google para iniciar sesión, CLEO recibe únicamente la información necesaria
        para autenticar la cuenta, como el identificador de usuario, el nombre y el correo asociados.
        CLEO no recibe ni almacena la contraseña de Google.
      </P>
      <P><strong>b) Información del negocio o actividad profesional</strong></P>
      <Ul
        items={[
          "Nombre del negocio.",
          "Nombre comercial.",
          "Logotipo.",
          "Giro o tipo de actividad.",
          "Dirección, teléfono, correo y redes sociales del negocio.",
          "Colores, configuraciones y preferencias de personalización.",
          "Catálogos de productos o servicios.",
          "Condiciones de pago.",
          "Datos bancarios o instrucciones de pago que la persona decida registrar.",
        ]}
      />
      <P><strong>c) Información administrativa y comercial</strong></P>
      <Ul
        items={[
          "Datos de clientes y prospectos.",
          "Cotizaciones.",
          "Pedidos y trabajos.",
          "Productos o servicios.",
          "Ingresos y ventas.",
          "Pagos administrativos, anticipos, saldos y fechas.",
          "Recordatorios y seguimientos.",
          "Notas comerciales.",
          "Documentos y archivos adjuntos relacionados con cotizaciones.",
          "Información necesaria para generar cotizaciones y comprobantes.",
        ]}
      />
      <P><strong>d) Información técnica y de uso</strong></P>
      <Ul
        items={[
          "Fecha y hora de acceso.",
          "Dirección IP y datos generales del dispositivo o navegador.",
          "Errores técnicos, fallos de funcionamiento y diagnósticos.",
          "Datos necesarios para proteger la sesión, sincronizar la información y prevenir accesos no autorizados.",
          "Información almacenada localmente en el navegador para permitir el funcionamiento de CLEO.",
        ]}
      />
      <P>
        CLEO no solicita datos personales sensibles. La persona usuaria debe abstenerse de registrar
        datos relativos a salud, origen étnico o racial, creencias religiosas, opiniones políticas,
        afiliación sindical, vida sexual, información genética, datos biométricos destinados a
        identificar de manera única a una persona u otra información sensible que no sea necesaria para
        utilizar la plataforma.
      </P>

      <H>4. Finalidades primarias del tratamiento</H>
      <P>Los datos personales serán utilizados para las siguientes finalidades necesarias:</P>
      <Ul
        items={[
          "Crear, autenticar y administrar la cuenta.",
          "Confirmar el correo electrónico.",
          "Permitir el inicio de sesión mediante correo, contraseña o Google.",
          "Recuperar el acceso o actualizar la contraseña.",
          "Proporcionar las funciones disponibles en CLEO.",
          "Guardar y sincronizar la información del negocio.",
          "Crear y administrar clientes, cotizaciones, trabajos, pedidos, productos, servicios, ingresos, pagos administrativos, recordatorios y seguimientos.",
          "Generar documentos, cotizaciones, comprobantes y archivos de exportación solicitados por la persona usuaria.",
          "Almacenar y permitir la consulta de archivos adjuntos.",
          "Mostrar información, alertas y sugerencias relacionadas con la operación del negocio.",
          "Mantener respaldos técnicos y permitir la recuperación de información cuando resulte aplicable.",
          "Detectar conflictos de sincronización y proteger la integridad de los datos.",
          "Prevenir pérdida de información, abuso, fraude o acceso no autorizado.",
          "Diagnosticar errores y mejorar la estabilidad y seguridad de CLEO.",
          "Atender solicitudes de soporte.",
          "Cumplir obligaciones legales.",
          "Gestionar la eliminación de la cuenta y de la información asociada.",
        ]}
      />
      <P>
        Si la persona no proporciona los datos necesarios para estas finalidades, es posible que CLEO no
        pueda crear o administrar su cuenta ni prestar algunas de sus funciones.
      </P>

      <H>5. Información financiera o patrimonial</H>
      <P>
        CLEO permite registrar voluntariamente información administrativa relacionada con precios,
        ingresos, ventas, anticipos, saldos, datos bancarios e instrucciones de pago.
      </P>
      <P>
        Esta información puede tener carácter financiero o patrimonial. Por ello, cuando resulte
        aplicable, CLEO solicitará el consentimiento expreso de la persona titular antes de comenzar a
        utilizar la plataforma.
      </P>
      <P>
        CLEO no es una institución financiera, banco, procesador de pagos, sistema contable ni
        plataforma fiscal. CLEO no recibe, transfiere ni custodia dinero. La información financiera
        registrada sirve únicamente para la organización administrativa del negocio de la persona
        usuaria.
      </P>
      <P>
        La persona usuaria es responsable de verificar los montos, cálculos, saldos, fechas, impuestos,
        condiciones y datos bancarios antes de utilizarlos o compartirlos.
      </P>

      <H>6. Datos de clientes y otras personas</H>
      <P>
        La persona usuaria puede decidir registrar información de sus clientes, prospectos, proveedores
        u otras personas. Respecto de esa información, la persona usuaria declara que:
      </P>
      <Ul
        items={[
          "Cuenta con autorización, consentimiento o alguna otra base legal válida para recopilarla, registrarla y utilizarla.",
          "Informará a las personas correspondientes sobre el tratamiento de sus datos cuando legalmente resulte necesario.",
          "Registrará únicamente la información adecuada, pertinente y necesaria para su actividad.",
          "No cargará información obtenida de manera ilícita.",
          "No utilizará CLEO para enviar comunicaciones no solicitadas, acosar, discriminar o vulnerar derechos.",
          "No registrará datos personales sensibles salvo que exista una necesidad legítima, una base legal suficiente y medidas adecuadas; en cualquier caso, CLEO no está diseñado para almacenar esa clase de información.",
        ]}
      />
      <P>
        CLEO funciona como una herramienta tecnológica utilizada bajo las instrucciones de la persona
        usuaria. La persona usuaria continúa siendo responsable de la relación y de las obligaciones
        legales que mantenga con sus propios clientes.
      </P>

      <H>7. Modalidad demo</H>
      <P>CLEO puede ofrecer un modo demo con información ficticia para explorar las funciones de la plataforma.</P>
      <P>
        Mientras el modo demo se encuentre activo, los datos de ejemplo y los cambios hechos dentro de
        esa demostración se almacenan temporalmente en el navegador y no deben sustituir los datos
        reales previamente protegidos en la nube.
      </P>
      <P>
        Al salir del modo demo, cerrar sesión o ejecutar las acciones indicadas en la aplicación, los
        datos temporales de demostración podrán eliminarse.
      </P>
      <P>La persona usuaria no debe registrar información real o confidencial dentro del modo demo.</P>

      <H>8. Almacenamiento local y sincronización</H>
      <P>
        CLEO utiliza almacenamiento local del navegador para permitir el funcionamiento de la interfaz,
        conservar temporalmente información y apoyar la sincronización con la nube.
      </P>
      <P>
        El almacenamiento local puede incluir información del perfil, clientes, cotizaciones, pedidos,
        ventas, productos, servicios, recordatorios, preferencias y estados temporales necesarios para
        la aplicación.
      </P>
      <P>
        El contenido almacenado localmente puede permanecer en el dispositivo hasta que sea
        sincronizado, sustituido, eliminado por la aplicación, eliminado por la persona usuaria o
        borrado mediante la configuración del navegador.
      </P>
      <P>
        Si se utiliza un dispositivo compartido, la persona usuaria debe cerrar sesión cuando termine.
        CLEO implementa controles para evitar que los datos de una cuenta se mezclen con los de otra,
        pero la seguridad física y el acceso al dispositivo también son responsabilidad de su propietario
        o usuario.
      </P>

      <H>9. Proveedores tecnológicos y transferencias</H>
      <P>
        Para operar CLEO podemos utilizar proveedores tecnológicos que procesan información por cuenta
        de la responsable o que prestan servicios indispensables para el funcionamiento de la
        plataforma, entre ellos:
      </P>
      <Ul
        items={[
          "Supabase: autenticación, base de datos, almacenamiento y funciones de servidor.",
          "Vercel: alojamiento y distribución de la aplicación.",
          "Sentry: detección y diagnóstico de errores técnicos.",
          "Resend: envío de correos transaccionales.",
          "Google: autenticación opcional mediante Google.",
          "ImprovMX: recepción y reenvío del correo de soporte.",
        ]}
      />
      <P>
        Estos proveedores pueden operar infraestructura localizada fuera de México. En consecuencia, la
        información puede ser procesada o almacenada en otros países, sujeta a medidas contractuales,
        técnicas y organizativas razonables.
      </P>
      <P>CLEO no vende ni renta los datos personales de sus usuarios.</P>
      <P>
        La información también podrá comunicarse a autoridades competentes cuando exista una obligación
        legal, orden fundada o requerimiento válido.
      </P>

      <H>10. Conservación y eliminación</H>
      <P>
        Los datos se conservarán mientras la cuenta permanezca activa y durante el tiempo necesario para
        prestar el servicio, atender solicitudes, resolver incidentes, cumplir obligaciones legales y
        proteger derechos.
      </P>
      <P>
        CLEO puede conservar respaldos técnicos limitados durante periodos adicionales cuando sean
        necesarios para recuperar información, prevenir pérdida accidental o atender obligaciones
        legales. Estos respaldos no se utilizarán para finalidades diferentes.
      </P>
      <P>
        Cuando la persona solicite y confirme la eliminación de su cuenta, CLEO eliminará la cuenta y
        los datos directamente asociados, conforme al funcionamiento técnico disponible y a las
        obligaciones legales aplicables.
      </P>
      <P>
        La eliminación de la cuenta es permanente. La persona usuaria debe descargar previamente
        cualquier información que desee conservar.
      </P>
      <P>
        Ciertos registros mínimos podrán conservarse cuando exista una obligación legal, una
        controversia, una investigación de seguridad o la necesidad de acreditar el cumplimiento de una
        obligación.
      </P>

      <H>11. Medidas de seguridad</H>
      <P>
        CLEO aplica medidas administrativas, técnicas y organizativas razonables para proteger los datos
        contra daño, pérdida, alteración, destrucción, uso, acceso o tratamiento no autorizado. Estas
        medidas incluyen, según corresponda:
      </P>
      <Ul
        items={[
          "Autenticación de usuarios.",
          "Confirmación de correo.",
          "Recuperación segura de contraseña.",
          "Restricciones de acceso por usuario.",
          "Políticas de seguridad en base de datos y almacenamiento.",
          "Sincronización controlada.",
          "Detección de conflictos.",
          "Respaldos técnicos.",
          "Monitoreo de errores.",
          "Eliminación segura de cuenta.",
          "Controles para impedir que una cuenta consulte información perteneciente a otra.",
        ]}
      />
      <P>
        Ningún sistema conectado a Internet puede garantizar seguridad absoluta. La persona usuaria debe
        utilizar una contraseña segura, proteger sus dispositivos, evitar compartir sus accesos y
        reportar cualquier actividad sospechosa.
      </P>

      <H>12. Incidentes de seguridad</H>
      <P>
        Si ocurre una vulneración de seguridad que afecte de forma significativa los derechos
        patrimoniales o morales de las personas titulares, CLEO realizará las acciones razonables y
        legalmente aplicables, incluyendo informar a las personas afectadas cuando corresponda.
      </P>

      <H>13. Derechos ARCO y revocación del consentimiento</H>
      <P>La persona titular puede solicitar:</P>
      <Ul
        items={[
          "Acceso a sus datos personales.",
          "Rectificación de datos inexactos o incompletos.",
          "Cancelación cuando considere que los datos no deben continuar siendo tratados.",
          "Oposición al tratamiento por una causa legítima.",
          "Revocación del consentimiento, cuando el tratamiento dependa de este.",
          "Limitación del uso o divulgación de sus datos, cuando resulte aplicable.",
        ]}
      />
      <P>
        La solicitud deberá enviarse a: <strong>{LEGAL_CONTACTO}</strong>
      </P>
      <P>La solicitud debe contener, al menos:</P>
      <Ul
        items={[
          "Nombre de la persona titular.",
          "Correo asociado a la cuenta.",
          "Descripción clara del derecho que desea ejercer.",
          "Datos o tratamiento sobre los que presenta la solicitud.",
          "Información que permita verificar razonablemente su identidad.",
        ]}
      />
      <P>
        Podremos solicitar información adicional cuando sea necesaria para confirmar la identidad o
        localizar los datos. La solicitud será atendida dentro de los plazos establecidos por la
        legislación aplicable.
      </P>
      <P>
        La revocación del consentimiento no tendrá efectos retroactivos y, en algunos casos, puede
        impedir que CLEO continúe prestando el servicio.
      </P>
      <P>La persona titular también puede eliminar su cuenta mediante la función disponible dentro de CLEO.</P>

      <H>14. Limitación del uso o divulgación</H>
      <P>
        CLEO no utiliza actualmente los datos personales para publicidad de terceros ni para vender
        perfiles comerciales.
      </P>
      <P>
        Para solicitar la limitación de usos adicionales o dejar de recibir comunicaciones no
        indispensables, la persona puede escribir a {LEGAL_CONTACTO}.
      </P>
      <P>
        Los mensajes indispensables para confirmar la cuenta, recuperar el acceso, mantener la
        seguridad, responder solicitudes o comunicar cambios relevantes del servicio podrán continuar
        enviándose mientras la cuenta permanezca activa.
      </P>

      <H>15. Decisiones automatizadas</H>
      <P>
        CLEO puede mostrar recordatorios, sugerencias, clasificaciones o mensajes generados mediante
        reglas internas basadas en la información registrada por la persona usuaria.
      </P>
      <P>
        Estas funciones tienen fines organizativos y no producen por sí solas efectos jurídicos ni
        sustituyen el criterio profesional, comercial, contable, fiscal o financiero de la persona
        usuaria.
      </P>

      <H>16. Modificaciones al aviso</H>
      <P>Este Aviso de Privacidad puede actualizarse cuando cambien:</P>
      <Ul
        items={[
          "Las funciones de CLEO.",
          "Las categorías de datos tratadas.",
          "Los proveedores tecnológicos.",
          "La modalidad comercial del servicio.",
          "Las obligaciones legales.",
          "Las prácticas de seguridad o conservación.",
        ]}
      />
      <P>
        Cuando una modificación requiera un nuevo consentimiento, CLEO solicitará una aceptación expresa
        antes de permitir que la persona continúe utilizando la versión correspondiente.
      </P>
      <P>La versión y fecha de vigencia estarán disponibles dentro de CLEO.</P>

      <H>17. Etapa beta y servicio futuro de pago</H>
      <P>CLEO se ofrece actualmente como una beta gratuita.</P>
      <P>La aceptación de este Aviso no autoriza cargos, suscripciones ni cobros automáticos.</P>
      <P>
        Si CLEO ofrece posteriormente planes de pago, se informarán previamente las condiciones,
        precios, periodicidad, métodos de pago, políticas de cancelación y tratamiento adicional de
        datos que pudiera resultar necesario. Cuando corresponda, se solicitará una aceptación nueva.
      </P>

      <H>18. Consentimiento</H>
      <P>Al marcar la casilla de aceptación y continuar, la persona declara que:</P>
      <Ul
        items={[
          "Es mayor de 18 años.",
          "Leyó y comprendió este Aviso de Privacidad.",
          "Conoce las finalidades para las cuales serán tratados sus datos.",
          "Autoriza expresamente el tratamiento de la información financiera o patrimonial que decida registrar.",
          "Reconoce su responsabilidad respecto de los datos de clientes y terceros que incorpore a CLEO.",
          "Acepta el uso de los proveedores tecnológicos necesarios para operar la plataforma.",
        ]}
      />

      <H>Responsable</H>
      <P>
        Danna Ivette Acuña Beltrán
        <br />
        Calle 36 número 245 entre 29 y 33
        <br />
        Colonia Francisco de Montejo
        <br />
        C.P. 97203
        <br />
        Mérida, Yucatán, México
        <br />
        Contacto: {LEGAL_CONTACTO}
      </P>
      <P>
        Versión 1.0 · Vigente desde el {LEGAL_FECHA_VIGENCIA}
      </P>
    </div>
  );
}

// ── TÉRMINOS Y CONDICIONES DE LA BETA DE CLEO ───────────────────────────
function TerminosContenido() {
  return (
    <div>
      <P>
        <strong>Versión 1.0</strong>
        <br />
        Fecha de entrada en vigor: {LEGAL_FECHA_VIGENCIA}
      </P>

      <H>1. Identificación y aceptación</H>
      <P>
        Estos Términos y Condiciones regulan el acceso y uso de CLEO, plataforma digital operada por
        Danna Ivette Acuña Beltrán, con domicilio en Calle 36 número 245 entre 29 y 33, colonia
        Francisco de Montejo, C.P. 97203, Mérida, Yucatán, México.
      </P>
      <P>
        Contacto: <strong>{LEGAL_CONTACTO}</strong>
      </P>
      <P>
        Al crear una cuenta, iniciar sesión y aceptar estos Términos, la persona usuaria celebra un
        acuerdo con la operadora de CLEO y manifiesta haber leído y aceptado:
      </P>
      <Ul
        items={[
          "Estos Términos y Condiciones de la Beta.",
          "El Aviso de Privacidad vigente.",
          "Las reglas y avisos mostrados dentro de CLEO.",
        ]}
      />
      <P>
        Si la persona no está de acuerdo, no debe utilizar CLEO y puede cerrar sesión o solicitar la
        eliminación de su cuenta.
      </P>

      <H>2. Requisito de edad y capacidad</H>
      <P>
        CLEO está disponible exclusivamente para personas mayores de 18 años que cuenten con capacidad
        legal para aceptar estos Términos.
      </P>
      <P>Al aceptar, la persona declara que tiene al menos 18 años.</P>
      <P>
        CLEO no está diseñado para ser utilizado directamente por menores de edad. Si se detecta una
        cuenta perteneciente a una persona menor de 18 años, CLEO podrá restringirla o eliminarla.
      </P>

      <H>3. Naturaleza de la beta</H>
      <P>CLEO se encuentra en etapa beta. Esto significa que:</P>
      <Ul
        items={[
          "El producto continúa en desarrollo y evaluación.",
          "Algunas funciones pueden cambiar, corregirse, limitarse o eliminarse.",
          "Pueden existir errores, interrupciones o comportamientos inesperados.",
          "La experiencia puede variar entre dispositivos y navegadores.",
          "Podrán realizarse ajustes derivados de las pruebas y comentarios de los usuarios.",
          "No todas las funciones previstas para la versión comercial se encuentran disponibles.",
        ]}
      />
      <P>La beta se proporciona actualmente sin costo.</P>
      <P>
        Aceptar estos Términos no genera una suscripción, no autoriza cargos y no obliga a contratar
        posteriormente un plan de pago.
      </P>

      <H>4. Finalidad de CLEO</H>
      <P>
        CLEO es una herramienta de apoyo para que personas emprendedoras puedan organizar información
        relacionada con su actividad, incluyendo, según el perfil disponible:
      </P>
      <Ul
        items={[
          "Clientes y prospectos.",
          "Productos o servicios.",
          "Cotizaciones.",
          "Trabajos y pedidos.",
          "Ingresos y ventas.",
          "Pagos administrativos.",
          "Anticipos y saldos.",
          "Recordatorios y seguimientos.",
          "Archivos relacionados con cotizaciones.",
          "Documentos, comprobantes y exportaciones.",
          "Información y preferencias del negocio.",
        ]}
      />
      <P>
        CLEO no sustituye asesoría profesional, contable, fiscal, financiera, jurídica, comercial ni
        administrativa.
      </P>

      <H>5. Creación y seguridad de la cuenta</H>
      <P>
        Para utilizar CLEO puede ser necesario crear una cuenta mediante correo y contraseña o utilizar
        el inicio de sesión con Google.
      </P>
      <P>La persona usuaria se compromete a:</P>
      <Ul
        items={[
          "Proporcionar información propia y lícita.",
          "Mantener actualizado el correo vinculado a la cuenta.",
          "Utilizar una contraseña segura.",
          "Proteger sus dispositivos y credenciales.",
          "No compartir el acceso con personas no autorizadas.",
          "Cerrar sesión al utilizar dispositivos compartidos.",
          "Informar a " + LEGAL_CONTACTO + " si detecta actividad sospechosa.",
        ]}
      />
      <P>
        La persona usuaria es responsable de las acciones realizadas desde su cuenta, salvo que deriven
        de una vulneración directamente atribuible a CLEO.
      </P>
      <P>
        CLEO podrá aplicar medidas razonables para confirmar la identidad, recuperar el acceso, prevenir
        abuso o proteger la información.
      </P>

      <H>6. Uso permitido</H>
      <P>La persona usuaria puede utilizar CLEO para organizar legítimamente su negocio o actividad profesional.</P>
      <P>No se permite:</P>
      <Ul
        items={[
          "Utilizar CLEO para actividades ilícitas o fraudulentas.",
          "Suplantar a otra persona.",
          "Intentar acceder a cuentas o información ajena.",
          "Interferir con la seguridad o funcionamiento del servicio.",
          "Introducir código malicioso, virus o archivos diseñados para dañar.",
          "Probar vulnerabilidades sin autorización.",
          "Automatizar accesos de manera abusiva.",
          "Copiar, revender o explotar la plataforma sin autorización.",
          "Registrar información obtenida ilegalmente.",
          "Utilizar datos para acosar, discriminar o perjudicar a otras personas.",
          "Enviar comunicaciones masivas no solicitadas.",
          "Cargar material que infrinja derechos de autor, marcas, privacidad u otros derechos.",
          "Registrar datos personales sensibles innecesarios.",
          "Utilizar CLEO como sustituto de sistemas regulados que exijan certificaciones específicas.",
        ]}
      />
      <P>
        CLEO podrá suspender o terminar el acceso cuando existan indicios razonables de incumplimiento,
        riesgo de seguridad, fraude, abuso o afectación a otras personas.
      </P>

      <H>7. Responsabilidad sobre los datos registrados</H>
      <P>
        La persona usuaria decide qué información incorpora a CLEO y es responsable de su exactitud,
        legalidad, pertinencia y actualización.
      </P>
      <P>
        Cuando registre datos de clientes, prospectos, proveedores u otras personas, declara que cuenta
        con autorización, consentimiento u otra base legal válida para hacerlo.
      </P>
      <P>La persona usuaria se compromete a:</P>
      <Ul
        items={[
          "Registrar únicamente los datos necesarios.",
          "Informar a sus clientes cuando legalmente corresponda.",
          "Respetar solicitudes relacionadas con privacidad.",
          "No cargar datos sensibles sin una justificación y protección adecuadas.",
          "No utilizar CLEO para crear bases de datos ilícitas.",
          "Eliminar o corregir información cuando proceda.",
        ]}
      />
      <P>
        CLEO proporciona la infraestructura tecnológica, pero no determina la relación comercial ni las
        obligaciones legales que la persona usuaria mantiene con sus propios clientes.
      </P>

      <H>8. Información financiera, pagos y cálculos</H>
      <P>
        CLEO permite registrar información administrativa relacionada con precios, ingresos, ventas,
        pagos, anticipos, descuentos, saldos, datos bancarios y condiciones de pago.
      </P>
      <P>CLEO no:</P>
      <Ul
        items={[
          "Procesa pagos reales.",
          "Recibe ni custodia dinero.",
          "Realiza transferencias bancarias.",
          "Emite facturas fiscales.",
          "Presenta declaraciones.",
          "Calcula impuestos de manera certificada.",
          "Actúa como banco, institución financiera, contador o asesor fiscal.",
          "Garantiza que un cliente haya pagado realmente.",
        ]}
      />
      <P>Las funciones de pagos y saldos son únicamente registros administrativos creados por la persona usuaria.</P>
      <P>La persona usuaria debe verificar antes de utilizar o compartir cualquier información:</P>
      <Ul
        items={[
          "Precios.",
          "Cantidades.",
          "Totales.",
          "Descuentos.",
          "Anticipos.",
          "Pagos.",
          "Saldos.",
          "Fechas.",
          "Monedas.",
          "Datos bancarios.",
          "Condiciones comerciales.",
          "Impuestos y obligaciones fiscales.",
        ]}
      />
      <P>
        Si la persona elimina o modifica un pago, cotización, venta, pedido u otro registro, es
        responsable de comprobar el efecto en sus reportes y documentos.
      </P>

      <H>9. Cotizaciones, comprobantes y documentos</H>
      <P>
        CLEO puede generar cotizaciones, comprobantes, archivos PDF, archivos para hojas de cálculo y
        copias de información a partir de los datos proporcionados por la persona usuaria.
      </P>
      <P>Estos documentos:</P>
      <Ul
        items={[
          "No sustituyen una factura fiscal.",
          "No garantizan la aceptación de una cotización.",
          "No prueban por sí solos la recepción de dinero.",
          "No constituyen asesoría legal, contable o fiscal.",
          "Deben revisarse antes de compartirse.",
          "Pueden contener errores derivados de información incompleta o incorrecta registrada por la persona usuaria.",
        ]}
      />
      <P>
        La persona usuaria es responsable de comprobar nombres, conceptos, montos, fechas, saldos, datos
        bancarios, condiciones y cualquier otro contenido antes de entregar un documento a sus clientes.
      </P>

      <H>10. Archivos adjuntos</H>
      <P>CLEO puede permitir que la persona usuaria almacene archivos relacionados con cotizaciones u operaciones.</P>
      <P>La persona usuaria debe cargar únicamente archivos:</P>
      <Ul
        items={[
          "De su propiedad o respecto de los cuales tenga autorización.",
          "Relacionados legítimamente con su actividad.",
          "Libres de código malicioso.",
          "Que no vulneren privacidad, propiedad intelectual u otros derechos.",
          "Que no contengan información sensible innecesaria.",
        ]}
      />
      <P>CLEO puede establecer límites de tamaño, tipo y cantidad de archivos.</P>
      <P>
        La persona usuaria debe conservar copias independientes de cualquier documento importante. CLEO
        no debe utilizarse como único repositorio de archivos esenciales.
      </P>

      <H>11. Recordatorios y sugerencias</H>
      <P>
        CLEO puede mostrar recordatorios, prioridades, mensajes sugeridos y recomendaciones basados en
        reglas internas y en la información registrada.
      </P>
      <P>Estas funciones son orientativas. La persona usuaria decide:</P>
      <Ul
        items={[
          "Si contacta a un cliente.",
          "Cuándo lo hace.",
          "Qué mensaje envía.",
          "Si conserva, modifica, reprograma o elimina un recordatorio.",
          "Qué decisiones comerciales adopta.",
        ]}
      />
      <P>CLEO no garantiza que una sugerencia produzca una venta, respuesta o resultado determinado.</P>

      <H>12. Modo demo</H>
      <P>CLEO puede ofrecer un modo demo con información ficticia.</P>
      <P>
        Los cambios realizados durante el modo demo son temporales y pueden eliminarse al salir de él o
        cerrar sesión. Los datos del modo demo no deben considerarse registros comerciales reales.
      </P>
      <P>La persona usuaria no debe introducir información real, confidencial o indispensable dentro de la demostración.</P>
      <P>
        Antes de entrar al modo demo, CLEO puede intentar proteger los datos reales mediante
        sincronización. Si esa protección no puede confirmarse, la entrada al modo demo podrá
        bloquearse.
      </P>

      <H>13. Disponibilidad y cambios</H>
      <P>Durante la beta, CLEO puede:</P>
      <Ul
        items={[
          "Corregir errores.",
          "Modificar diseños y flujos.",
          "Añadir o retirar funciones.",
          "Realizar mantenimiento.",
          "Suspender temporalmente partes del servicio.",
          "Establecer límites técnicos razonables.",
          "Cambiar proveedores de infraestructura.",
          "Solicitar una nueva aceptación cuando cambien las condiciones.",
        ]}
      />
      <P>
        Se procurará mantener el servicio disponible, pero no se garantiza que funcione de forma
        continua, inmediata o libre de errores.
      </P>
      <P>
        Las interrupciones pueden deberse a mantenimiento, actualizaciones, fallos de Internet,
        navegadores, dispositivos o servicios de proveedores externos.
      </P>

      <H>14. Sincronización, respaldos y exportación</H>
      <P>CLEO utiliza almacenamiento local y sincronización en la nube para conservar la información.</P>
      <P>Aunque existen mecanismos para reducir el riesgo de pérdida, pueden ocurrir:</P>
      <Ul
        items={[
          "Fallos de red.",
          "Conflictos entre dispositivos.",
          "Cambios no sincronizados.",
          "Cierres inesperados del navegador.",
          "Errores del dispositivo.",
          "Eliminaciones accidentales.",
          "Incidentes de proveedores tecnológicos.",
        ]}
      />
      <P>La persona usuaria debe:</P>
      <Ul
        items={[
          "Atender los avisos de sincronización.",
          "Resolver conflictos antes de cerrar sesión.",
          "Descargar copias periódicas de la información importante.",
          "Verificar que sus cambios se conserven.",
          "Mantener respaldos independientes de documentos esenciales.",
        ]}
      />
      <P>
        CLEO ofrece herramientas de exportación, pero no garantiza que una copia sustituya los respaldos
        profesionales requeridos por cada negocio.
      </P>

      <H>15. Soporte y comunicación de errores</H>
      <P>
        Las solicitudes de ayuda pueden enviarse a: <strong>{LEGAL_CONTACTO}</strong>
      </P>
      <P>
        Al reportar un problema, la persona usuaria debe evitar compartir contraseñas, tokens, datos
        bancarios completos o información sensible.
      </P>
      <P>CLEO puede solicitar información técnica razonablemente necesaria para reproducir y corregir el problema.</P>
      <P>
        Los comentarios y sugerencias proporcionados durante la beta podrán utilizarse para mejorar
        CLEO. Esto no otorga a CLEO derechos sobre los datos comerciales ni sobre el contenido
        confidencial de la persona usuaria.
      </P>

      <H>16. Propiedad intelectual</H>
      <P>
        CLEO, su código, diseño, interfaz, identidad visual, estructura, textos propios, funciones y
        demás elementos originales pertenecen a su operadora o se utilizan con autorización.
      </P>
      <P>
        La aceptación de estos Términos concede únicamente un derecho personal, limitado, revocable, no
        exclusivo y no transferible para utilizar CLEO conforme a estos Términos.
      </P>
      <P>No se permite:</P>
      <Ul
        items={[
          "Copiar o distribuir la aplicación.",
          "Revender el acceso.",
          "Extraer o reutilizar sistemáticamente sus elementos.",
          "Intentar obtener el código fuente salvo en los casos permitidos por la ley.",
          "Eliminar avisos de propiedad.",
          "Utilizar el nombre, marca o identidad de CLEO de forma engañosa.",
        ]}
      />
      <P>La persona usuaria conserva los derechos que le correspondan sobre los datos y materiales legítimos que registre.</P>

      <H>17. Proveedores externos</H>
      <P>CLEO depende de proveedores tecnológicos, entre ellos Supabase, Vercel, Sentry, Resend, Google e ImprovMX.</P>
      <P>El funcionamiento de ciertas características puede depender de la disponibilidad y políticas de dichos proveedores.</P>
      <P>El uso de Google para iniciar sesión también está sujeto a las condiciones y políticas de Google.</P>
      <P>
        CLEO procurará seleccionar y configurar responsablemente a sus proveedores, pero no controla
        totalmente sus redes, infraestructura o interrupciones.
      </P>

      <H>18. Privacidad</H>
      <P>
        El tratamiento de datos personales se rige por el Aviso de Privacidad vigente de CLEO,
        disponible antes del registro, durante la aceptación legal y dentro de "Mi cuenta".
      </P>
      <P>La aceptación de estos Términos no sustituye los consentimientos específicos que legalmente puedan resultar necesarios.</P>

      <H>19. Suspensión y terminación</H>
      <P>CLEO podrá suspender o cancelar una cuenta cuando:</P>
      <Ul
        items={[
          "Se incumplan estos Términos.",
          "Exista riesgo para otras personas o para la plataforma.",
          "Se detecte fraude, abuso o acceso no autorizado.",
          "Lo solicite una autoridad competente.",
          "Sea necesario proteger la integridad del servicio.",
          "La operación de la beta se suspenda o concluya.",
        ]}
      />
      <P>
        Cuando las circunstancias lo permitan, se procurará informar a la persona usuaria y darle
        oportunidad de descargar su información.
      </P>
      <P>La persona usuaria puede dejar de utilizar CLEO, cerrar sesión o eliminar su cuenta.</P>

      <H>20. Eliminación de la cuenta</H>
      <P>CLEO incluye una función para solicitar la eliminación permanente de la cuenta.</P>
      <P>Antes de confirmar la eliminación, la persona usuaria debe descargar toda la información que quiera conservar.</P>
      <P>Una vez confirmada y procesada la eliminación:</P>
      <Ul
        items={[
          "La cuenta dejará de estar disponible.",
          "Los datos directamente asociados serán eliminados conforme al funcionamiento técnico y a las obligaciones aplicables.",
          "La acción no podrá deshacerse desde la aplicación.",
          "Podrán subsistir temporalmente respaldos técnicos limitados o registros exigidos por ley.",
        ]}
      />
      <P>Cerrar sesión no elimina la cuenta.</P>
      <P>"Empezar desde cero" elimina información operativa, pero no necesariamente elimina la cuenta de autenticación.</P>

      <H>21. Limitación razonable de responsabilidad</H>
      <P>CLEO se proporciona como una herramienta beta de apoyo administrativo.</P>
      <P>
        En la medida permitida por la legislación aplicable, CLEO no será responsable de decisiones
        comerciales, fiscales, contables, financieras o jurídicas tomadas exclusivamente con base en
        información, cálculos, recordatorios o documentos generados por la plataforma.
      </P>
      <P>CLEO tampoco será responsable de:</P>
      <Ul
        items={[
          "Información incorrecta registrada por la persona usuaria.",
          "Documentos compartidos sin revisión.",
          "Pérdidas derivadas de contraseñas o dispositivos no protegidos.",
          "Uso indebido de datos de clientes.",
          "Comunicaciones enviadas por la persona usuaria.",
          "Incumplimientos fiscales, contractuales o regulatorios de su negocio.",
          "Fallos de servicios externos fuera del control razonable de CLEO.",
          "Pérdida evitable de información cuando no se hayan conservado respaldos razonables.",
        ]}
      />
      <P>
        Nada de estos Términos excluye responsabilidades que no puedan limitarse legalmente ni elimina
        derechos irrenunciables de consumidores o titulares de datos.
      </P>

      <H>22. Indemnidad por uso ilícito</H>
      <P>
        En la medida permitida por la ley, la persona usuaria será responsable de los daños,
        reclamaciones o sanciones derivados de:
      </P>
      <Ul
        items={[
          "Información que haya obtenido o registrado ilegalmente.",
          "Falta de autorización para utilizar datos de terceros.",
          "Archivos o contenidos que infrinjan derechos.",
          "Uso fraudulento o abusivo de CLEO.",
          "Incumplimiento de sus obligaciones frente a clientes, autoridades o terceros.",
        ]}
      />
      <P>
        Esta disposición no aplica cuando el daño sea directamente atribuible a una conducta ilícita o
        negligencia legalmente demostrada de la operadora de CLEO.
      </P>

      <H>23. Futuros planes de pago</H>
      <P>La beta vigente es gratuita.</P>
      <P>
        CLEO podrá ofrecer posteriormente planes, suscripciones o funciones de pago. Antes de efectuar
        cualquier cobro se informará claramente:
      </P>
      <Ul
        items={[
          "Precio.",
          "Impuestos aplicables.",
          "Periodicidad.",
          "Funciones incluidas.",
          "Método de pago.",
          "Renovación.",
          "Cancelación.",
          "Reembolsos, cuando correspondan.",
          "Condiciones adicionales.",
        ]}
      />
      <P>Aceptar esta beta no autoriza cobros presentes o futuros. El servicio de pago requerirá una contratación o aceptación independiente.</P>

      <H>24. Modificaciones de los Términos</H>
      <P>Estos Términos pueden actualizarse para reflejar cambios en:</P>
      <Ul
        items={[
          "Las funciones.",
          "La operación.",
          "La seguridad.",
          "Los proveedores.",
          "El modelo comercial.",
          "Las obligaciones legales.",
        ]}
      />
      <P>La versión y fecha de vigencia estarán disponibles dentro de CLEO.</P>
      <P>
        Cuando el cambio sea relevante o requiera nuevo consentimiento, se solicitará una aceptación
        expresa antes de continuar utilizando la versión correspondiente.
      </P>

      <H>25. Legislación y jurisdicción</H>
      <P>Estos Términos se interpretarán conforme a las leyes aplicables de los Estados Unidos Mexicanos.</P>
      <P>
        Las partes procurarán resolver cualquier desacuerdo de buena fe mediante contacto previo a{" "}
        {LEGAL_CONTACTO}.
      </P>
      <P>
        Cuando legalmente proceda y sin afectar derechos irrenunciables de la persona consumidora, las
        partes se someten a las autoridades y tribunales competentes de Mérida, Yucatán, México.
      </P>

      <H>26. Integridad de los Términos</H>
      <P>
        Si alguna disposición se considera inválida o inaplicable, las demás continuarán vigentes en la
        medida permitida por la ley.
      </P>
      <P>La falta de ejercicio inmediato de un derecho no implica renuncia.</P>

      <H>27. Consentimiento</H>
      <P>Al marcar la casilla y continuar, la persona declara que:</P>
      <Ul
        items={[
          "Es mayor de 18 años.",
          "Leyó y comprendió estos Términos.",
          "Leyó el Aviso de Privacidad.",
          "Acepta utilizar CLEO bajo las reglas de la beta.",
          "Comprende que la beta es actualmente gratuita.",
          "Comprende que CLEO no procesa pagos ni sustituye asesoría profesional.",
          "Acepta su responsabilidad sobre la información que registre.",
          "Comprende que un futuro servicio de pago requerirá condiciones y aceptación nuevas.",
        ]}
      />

      <H>Operadora de CLEO</H>
      <P>
        Danna Ivette Acuña Beltrán
        <br />
        Calle 36 número 245 entre 29 y 33
        <br />
        Colonia Francisco de Montejo
        <br />
        C.P. 97203
        <br />
        Mérida, Yucatán, México
        <br />
        Contacto: {LEGAL_CONTACTO}
      </P>
      <P>Versión 1.0 · Vigente desde el {LEGAL_FECHA_VIGENCIA}</P>
    </div>
  );
}

// ── Modal reutilizable ───────────────────────────────────────────────────
// Única fuente de verdad para MOSTRAR cualquiera de los 2 documentos.
// AuthGate.jsx (pantalla legal obligatoria) y CLEO.jsx (Mi cuenta) importan
// exactamente este mismo componente , nunca copian el texto en otro lugar.
export function LegalModal(props) {
  var tipo = props.tipo; // "privacidad" | "terminos"
  var onClose = props.onClose;
  if (!tipo) return null;
  var titulo = tipo === "privacidad" ? "Aviso de Privacidad" : "Términos y Condiciones de la Beta";
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 2000,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 0,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: COLORS.surface,
          borderRadius: "20px 20px 0 0",
          width: "100%",
          maxWidth: 640,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.2)",
        }}
        onClick={function (ev) {
          ev.stopPropagation();
        }}
      >
        <div
          style={{
            padding: "18px 20px",
            borderBottom: "1px solid " + COLORS.border,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>{titulo}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              minWidth: 44,
              minHeight: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 22,
              color: COLORS.textDim,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: "16px 20px 28px", overflowY: "auto", flex: 1, WebkitOverflowScrolling: "touch" }}>
          {tipo === "privacidad" ? <AvisoPrivacidadContenido /> : <TerminosContenido />}
        </div>
      </div>
    </div>
  );
}

// ── Hook reutilizable para abrir/cerrar documentos ──────────────────────
// Evita que AuthGate.jsx y CLEO.jsx dupliquen su propio estado de
// "qué documento está abierto" con lógica distinta cada uno.
export function useDocumentoLegal() {
  var s = useState(null);
  var documentoAbierto = s[0];
  var setDocumentoAbierto = s[1];
  return {
    documentoAbierto: documentoAbierto,
    abrirPrivacidad: function () {
      setDocumentoAbierto("privacidad");
    },
    abrirTerminos: function () {
      setDocumentoAbierto("terminos");
    },
    cerrarDocumento: function () {
      setDocumentoAbierto(null);
    },
  };
}
