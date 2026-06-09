import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Política de Privacidad — Salto',
  description: 'Cómo Salto recolecta, usa y protege tus datos personales.',
};

const SECTIONS = [
  { id: 'responsable', label: 'Responsable del tratamiento' },
  { id: 'datos', label: 'Datos que recolectamos' },
  { id: 'finalidad', label: 'Para qué los usamos' },
  { id: 'base-legal', label: 'Base legal' },
  { id: 'comparticion', label: 'Con quién los compartimos' },
  { id: 'transferencias', label: 'Transferencias internacionales' },
  { id: 'retencion', label: 'Retención de datos' },
  { id: 'derechos', label: 'Tus derechos (Ley 1581)' },
  { id: 'seguridad', label: 'Seguridad' },
  { id: 'menores', label: 'Menores de edad' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'contacto', label: 'Contacto' },
];

function SectionHeader({ n, id, children }: { n: number; id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="flex items-center gap-3 text-xl font-display font-bold text-slate-900 mt-14 mb-5 scroll-mt-20">
      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold flex items-center justify-center">
        {n}
      </span>
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-slate-600 leading-relaxed mb-4">{children}</p>;
}

function UL({ items }: { items: (string | React.ReactNode)[] }) {
  return (
    <ul className="space-y-2 mb-5 ml-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-slate-600 leading-relaxed">
          <span className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Callout({ variant = 'neutral', children }: { variant?: 'neutral' | 'rights'; children: React.ReactNode }) {
  const styles = {
    neutral: 'bg-slate-50 border-slate-200 text-slate-700',
    rights: 'bg-emerald-50 border-emerald-200/60 text-emerald-900',
  };
  return (
    <div className={`border rounded-xl p-5 my-5 text-sm leading-relaxed ${styles[variant]}`}>
      {children}
    </div>
  );
}

function DataTable({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden mb-5">
      {rows.map(({ label, value }) => (
        <div key={label} className="grid grid-cols-[140px_1fr] sm:grid-cols-[180px_1fr]">
          <div className="bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide border-r border-slate-100 flex items-center">
            {label}
          </div>
          <div className="px-4 py-3 text-sm text-slate-700 leading-relaxed">
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

function RightBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <span className="mt-0.5 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">✓</span>
      <span className="text-sm text-slate-700 leading-relaxed">{children}</span>
    </div>
  );
}

export default function PrivacidadPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6">
      {/* Hero */}
      <div className="py-14 sm:py-20 border-b border-slate-100">
        <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200/60 text-emerald-800 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
          <ShieldCheck size={12} />
          Última actualización: Mayo 2026 · Ley 1581 de 2012
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold text-slate-900 tracking-tight leading-tight mb-5">
          Política de Privacidad
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl leading-relaxed">
          Tus datos son parte central de cómo funciona Salto. Por eso explicamos con exactitud qué recolectamos, para qué lo usamos y cómo puedes controlar tu información.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-slate-500">
          <span>¿Buscas los términos de uso?</span>
          <Link href="/legal/terminos" className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold hover:text-emerald-800 transition-colors">
            Leerlos aquí <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {/* Body: TOC + Content */}
      <div className="py-12 lg:grid lg:grid-cols-[220px_1fr] lg:gap-16">
        {/* Sticky TOC (desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-1">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-semibold mb-3 px-1">
              En este documento
            </div>
            {SECTIONS.map(({ id, label }, i) => (
              <a
                key={id}
                href={`#${id}`}
                className="flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-700 py-1.5 px-2 rounded-lg hover:bg-emerald-50 transition-colors group"
              >
                <span className="w-4 h-4 rounded-full border border-slate-200 group-hover:border-emerald-300 text-[10px] font-bold text-slate-400 group-hover:text-emerald-600 flex items-center justify-center flex-shrink-0 transition-colors">
                  {i + 1}
                </span>
                {label}
              </a>
            ))}
          </div>
        </aside>

        {/* Content */}
        <article className="min-w-0">
          <SectionHeader n={1} id="responsable">Responsable del tratamiento</SectionHeader>
          <P>
            <strong className="text-slate-900">Salto SAS</strong> (en proceso de constitución), con domicilio en Barranquilla, Atlántico, Colombia, es el responsable del tratamiento de tus datos personales de conformidad con la{' '}
            <strong className="text-slate-900">Ley 1581 de 2012</strong> (Ley de Protección de Datos Personales de Colombia) y el Decreto Reglamentario 1377 de 2013.
          </P>
          <DataTable rows={[
            { label: 'Empresa', value: 'Salto SAS (en constitución)' },
            { label: 'Ciudad', value: 'Barranquilla, Atlántico, Colombia' },
            { label: 'Contacto', value: 'legal@salto.app' },
            { label: 'Marco legal', value: 'Ley 1581/2012 · Decreto 1377/2013' },
          ]} />

          <SectionHeader n={2} id="datos">Datos que recolectamos</SectionHeader>
          <P>Dependiendo de cómo uses Salto, recolectamos diferentes tipos de datos:</P>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-3">
              Si eres joven buscando oportunidades
            </div>
            <UL items={[
              <><strong className="text-slate-900">Identificación:</strong> nombre, edad, género (este último es opcional y puedes elegir no indicarlo).</>,
              <><strong className="text-slate-900">Contacto:</strong> correo electrónico, proporcionado vía Google Sign-In.</>,
              <><strong className="text-slate-900">Experiencia y talento:</strong> respuestas a la entrevista conversacional, habilidades declaradas, logros, proyectos, contexto de vida.</>,
              <><strong className="text-slate-900">Datos generados por IA:</strong> perfil de evidencia estructurado, representación vectorial (embedding), ICS histórico frente a necesidades, resultados de microtareas completadas.</>,
            ]} />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-3">
              Si eres empresa o emprendimiento
            </div>
            <UL items={[
              <><strong className="text-slate-900">Datos corporativos:</strong> nombre de la empresa, NIT o número de identificación tributaria, nombre del representante legal, documento de identidad del representante.</>,
              <><strong className="text-slate-900">Contacto:</strong> correo electrónico corporativo vía Google Sign-In.</>,
              <><strong className="text-slate-900">Datos operativos:</strong> necesidades publicadas (rol, contexto, skills requeridos, rasgos deseados, restricciones duras).</>,
            ]} />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-3">
              Datos técnicos (todos los usuarios)
            </div>
            <UL items={[
              'Identificador único de usuario (Firebase UID).',
              'Datos de sesión y actividad en la plataforma.',
              'Metadatos de uso (páginas visitadas, acciones realizadas — no vendemos ni compartimos esto con anunciantes).',
            ]} />
          </div>

          <SectionHeader n={3} id="finalidad">Para qué usamos tus datos</SectionHeader>
          <UL items={[
            'Crear y gestionar tu perfil o cuenta en la plataforma.',
            'Calcular el ICS y realizar el matching entre jóvenes y empresas.',
            'Generar tu CV en formato ATS descargable.',
            'Identificar talentos latentes y habilidades transversales no evidentes.',
            'Mejorar los modelos de IA internos (usamos datos anonimizados y agregados — nunca tu nombre o datos identificables para este fin).',
            'Enviarte notificaciones relevantes: nuevos matches, resultados de microtareas, cambios en los términos.',
            'Cumplir obligaciones legales y regulatorias aplicables.',
          ]} />
          <P>
            <strong className="text-slate-900">No usamos tus datos</strong> para publicidad personalizada de terceros, ni los vendemos a brokers de datos.
          </P>

          <SectionHeader n={4} id="base-legal">Base legal del tratamiento</SectionHeader>
          <P>Tratamos tus datos con base en las siguientes legitimidades:</P>
          <DataTable rows={[
            { label: 'Consentimiento', value: 'Lo otorgas al crear tu cuenta y aceptar esta política. Puedes retirarlo eliminando tu cuenta.' },
            { label: 'Contrato', value: 'Para ejecutar el servicio que nos solicitaste (perfil, matching, CV, microtareas).' },
            { label: 'Obligación legal', value: 'Para cumplir con la Ley 1581 de 2012 y demás normas aplicables en Colombia.' },
            { label: 'Interés legítimo', value: 'Para mejorar el servicio con datos anonimizados y garantizar la seguridad de la plataforma.' },
          ]} />

          <SectionHeader n={5} id="comparticion">Con quién compartimos tus datos</SectionHeader>
          <P>
            Nunca vendemos tus datos. Los compartimos únicamente en los siguientes contextos controlados:
          </P>

          <div className="space-y-3 mb-5">
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2.5 text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                Empresas ven de jóvenes
              </div>
              <div className="px-4 py-3 text-sm text-slate-700 leading-relaxed">
                Nombre completo, perfil de evidencia, ICS desglosado, top habilidades, y la nota de red flag generada por IA. <strong className="text-slate-900">No compartimos correo electrónico ni información de contacto directa</strong> sin tu consentimiento explícito.
              </div>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Jóvenes ven de empresas
              </div>
              <div className="px-4 py-3 text-sm text-slate-700 leading-relaxed">
                Nombre de la empresa, rol publicado, contexto operativo e ICS de compatibilidad. No se comparte el NIT ni datos del representante legal.
              </div>
            </div>
          </div>

          <P><strong className="text-slate-900">Proveedores de tecnología (sub-encargados):</strong></P>
          <DataTable rows={[
            { label: 'Google Firebase', value: 'Autenticación de usuarios y base de datos principal. Política: firebase.google.com' },
            { label: 'Google Gemini AI', value: 'Procesamiento de entrevistas, generación de perfiles y ranking con IA. Política: ai.google.dev' },
            { label: 'Vercel', value: 'Infraestructura de hosting y despliegue. Política: vercel.com/legal/privacy-policy' },
          ]} />

          <SectionHeader n={6} id="transferencias">Transferencias internacionales de datos</SectionHeader>
          <P>
            Google LLC, con sede en Mountain View, California, Estados Unidos, procesa datos personales como parte de los servicios Firebase y Gemini AI. Esta transferencia internacional se realiza bajo las garantías de las{' '}
            <strong className="text-slate-900">Cláusulas Contractuales Estándar</strong> aprobadas por autoridades de protección de datos, y bajo el marco del{' '}
            <strong className="text-slate-900">Data Privacy Framework</strong> entre la UE y EE.UU. (como referencia de estándar de adecuación).
          </P>
          <P>
            Puedes consultar las garantías de privacidad de Google en{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-medium hover:text-emerald-800 transition-colors">
              policies.google.com
            </a>
            .
          </P>

          <SectionHeader n={7} id="retencion">Retención de datos</SectionHeader>
          <DataTable rows={[
            { label: 'Cuenta activa', value: 'Conservamos todos tus datos mientras tu cuenta esté activa.' },
            { label: 'Eliminación', value: 'Si eliminas tu cuenta, borramos tus datos personales identificables en un plazo máximo de 30 días.' },
            { label: 'Datos anonimizados', value: 'Patrones de uso y datos estadísticos sin identificadores personales pueden conservarse indefinidamente para mejorar el motor.' },
            { label: 'Obligación legal', value: 'Algunos datos pueden conservarse más tiempo si la ley colombiana lo exige (ej. registros de transacciones).' },
          ]} />

          <SectionHeader n={8} id="derechos">Tus derechos como titular (Ley 1581 de 2012)</SectionHeader>
          <Callout variant="rights">
            <strong>La Ley 1581 de 2012</strong> te otorga los siguientes derechos sobre tus datos personales. Para ejercer cualquiera de ellos, escríbenos a{' '}
            <a href="mailto:legal@salto.app" className="font-semibold text-emerald-700 hover:underline">legal@salto.app</a>{' '}
            con el asunto <strong>&quot;Derechos ARCO&quot;</strong> y respondemos en máximo <strong>10 días hábiles</strong>.
          </Callout>
          <div className="border border-slate-200 rounded-xl overflow-hidden mb-5">
            <RightBadge>
              <strong className="text-slate-900">Conocer:</strong> Saber exactamente qué datos personales tenemos sobre ti, cómo los obtuvimos y para qué los usamos.
            </RightBadge>
            <RightBadge>
              <strong className="text-slate-900">Actualizar:</strong> Solicitar la corrección de datos inexactos, incompletos u obsoletos.
            </RightBadge>
            <RightBadge>
              <strong className="text-slate-900">Rectificar:</strong> Pedir que corrijamos errores en tu información personal.
            </RightBadge>
            <RightBadge>
              <strong className="text-slate-900">Suprimir:</strong> Solicitar la eliminación de tus datos (&quot;derecho al olvido&quot;) cuando no exista una obligación legal de conservarlos.
            </RightBadge>
            <RightBadge>
              <strong className="text-slate-900">Revocar:</strong> Retirar el consentimiento que nos diste para el tratamiento de tus datos, sin que ello afecte lo ya realizado.
            </RightBadge>
            <RightBadge>
              <strong className="text-slate-900">Acceder:</strong> Obtener una copia de todos los datos que tenemos sobre ti en un formato legible.
            </RightBadge>
            <RightBadge>
              <strong className="text-slate-900">Quejar:</strong> Presentar una queja ante la Superintendencia de Industria y Comercio (SIC) si consideras que tus derechos han sido vulnerados. Más info en{' '}
              <a href="https://www.sic.gov.co" target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-medium hover:underline">
                www.sic.gov.co
              </a>.
            </RightBadge>
          </div>

          <SectionHeader n={9} id="seguridad">Seguridad de los datos</SectionHeader>
          <P>
            Implementamos medidas técnicas y organizativas para proteger tus datos contra acceso no autorizado, pérdida, alteración o divulgación:
          </P>
          <UL items={[
            'Cifrado en tránsito mediante HTTPS/TLS para toda la comunicación entre tu dispositivo y nuestros servidores.',
            'Autenticación segura gestionada por Firebase Auth (Google), que incluye protección contra fuerza bruta y sesiones cifradas.',
            'Acceso restringido por rol: solo el personal técnico necesario tiene acceso a datos de producción.',
            'Separación entre entornos de desarrollo y producción.',
          ]} />
          <P>
            Ningún sistema informático es 100% seguro. En caso de detectar una brecha de seguridad que afecte tus datos, te notificaremos en las <strong className="text-slate-900">72 horas</strong> siguientes a tener conocimiento del incidente, de conformidad con las obligaciones legales aplicables.
          </P>

          <SectionHeader n={10} id="menores">Menores de edad</SectionHeader>
          <P>
            Salto está dirigido a jóvenes mayores de 16 años. Los menores de entre 16 y 18 años pueden usar el servicio únicamente con autorización expresa de su representante legal.
          </P>
          <P>
            <strong className="text-slate-900">No recolectamos intencionalmente datos de menores de 16 años.</strong> Si identificamos que un usuario tiene menos de 16 años sin la debida autorización, eliminaremos su cuenta y datos asociados de forma inmediata. Si tienes conocimiento de un caso así, notifícanos a{' '}
            <a href="mailto:legal@salto.app" className="text-emerald-700 font-medium hover:text-emerald-800 transition-colors">
              legal@salto.app
            </a>.
          </P>

          <SectionHeader n={11} id="cookies">Cookies y tecnologías similares</SectionHeader>
          <P>
            Usamos únicamente <strong className="text-slate-900">cookies esenciales</strong> para el funcionamiento del servicio:
          </P>
          <DataTable rows={[
            { label: 'Sesión de usuario', value: 'Firebase Auth coloca una cookie para mantener tu sesión iniciada entre visitas. Es estrictamente necesaria y no puede desactivarse.' },
            { label: 'Preferencias locales', value: 'Guardamos algunas preferencias en localStorage (como tu último perfil creado) para mejorar la experiencia. No se envían a servidores externos.' },
          ]} />
          <P>
            <strong className="text-slate-900">No usamos cookies de rastreo publicitario, analítica de terceros ni píxeles de seguimiento.</strong>
          </P>

          <SectionHeader n={12} id="contacto">Contacto</SectionHeader>
          <P>
            Para ejercer tus derechos, reportar un incidente de seguridad o hacernos cualquier consulta sobre privacidad:
          </P>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 my-5 space-y-2 text-sm text-slate-700">
            <div><strong className="text-slate-900">Canal principal:</strong>{' '}
              <a href="mailto:legal@salto.app" className="text-emerald-700 font-medium hover:text-emerald-800 transition-colors">
                legal@salto.app
              </a>
            </div>
            <div><strong className="text-slate-900">Asunto sugerido:</strong> &quot;Derechos ARCO&quot; / &quot;Incidente de seguridad&quot; / &quot;Consulta de privacidad&quot;</div>
            <div><strong className="text-slate-900">Tiempo de respuesta:</strong> Máximo 10 días hábiles</div>
            <div><strong className="text-slate-900">Autoridad de protección de datos:</strong>{' '}
              <a href="https://www.sic.gov.co" target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-medium hover:text-emerald-800 transition-colors">
                Superintendencia de Industria y Comercio (SIC)
              </a>
            </div>
          </div>

          {/* Separator */}
          <div className="mt-14 pt-8 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-xs text-slate-400">
              Versión 1.0 · Vigente desde el 1 de mayo de 2026
            </p>
            <Link
              href="/legal/terminos"
              className="inline-flex items-center gap-1.5 text-sm text-emerald-700 font-semibold hover:text-emerald-800 transition-colors"
            >
              Leer Términos y Condiciones <ArrowRight size={13} />
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
