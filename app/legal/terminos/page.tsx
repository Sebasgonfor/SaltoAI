import type { Metadata } from 'next';
import Link from 'next/link';
import { Scale, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Términos y Condiciones — Salto',
  description: 'Condiciones de uso de la plataforma Salto.',
};

const SECTIONS = [
  { id: 'servicio', label: 'El servicio' },
  { id: 'aceptacion', label: 'Aceptación' },
  { id: 'requisitos', label: 'Requisitos de uso' },
  { id: 'cuenta', label: 'Tu cuenta' },
  { id: 'contenido', label: 'Contenido y propiedad' },
  { id: 'ia', label: 'Motor de IA y limitaciones' },
  { id: 'microtareas', label: 'Microtareas' },
  { id: 'responsabilidad', label: 'Limitación de responsabilidad' },
  { id: 'modificaciones', label: 'Modificaciones' },
  { id: 'contacto', label: 'Contacto y ley aplicable' },
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

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-amber-50 border border-amber-200/70 rounded-xl p-4 my-5 text-sm text-amber-900 leading-relaxed">
      {children}
    </div>
  );
}

export default function TerminosPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6">
      {/* Hero */}
      <div className="py-14 sm:py-20 border-b border-slate-100">
        <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200/60 text-emerald-800 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
          <Scale size={12} />
          Última actualización: Mayo 2026
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold text-slate-900 tracking-tight leading-tight mb-5">
          Términos y Condiciones
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl leading-relaxed">
          Al usar Salto, aceptas estas condiciones. Las escribimos en español claro porque creemos que los documentos legales también pueden ser entendibles.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-slate-500">
          <span>¿Buscas la política de privacidad?</span>
          <Link href="/legal/privacidad" className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold hover:text-emerald-800 transition-colors">
            Leerla aquí <ArrowRight size={13} />
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
          <SectionHeader n={1} id="servicio">El servicio</SectionHeader>
          <P>
            Salto es una plataforma tecnológica que conecta jóvenes con talento no certificado con startups y mipymes mediante un sistema de matching basado en inteligencia artificial. El servicio está operado por Salto SAS (en proceso de constitución), con sede en Barranquilla, Atlántico, Colombia.
          </P>
          <P>El servicio incluye:</P>
          <UL items={[
            'Entrevistas conversacionales para construir perfiles de evidencia de talento.',
            'Un motor de compatibilidad (Índice de Compatibilidad Salto — ICS) que compara perfiles contra necesidades publicadas por empresas.',
            'Microtareas remuneradas como mecanismo de validación de habilidades.',
            'Herramientas de gestión y análisis para empresas.',
            'Generación de CVs en formato ATS descargables.',
          ]} />

          <SectionHeader n={2} id="aceptacion">Aceptación de los términos</SectionHeader>
          <P>
            Al crear una cuenta, completar la entrevista, publicar una necesidad o usar cualquier función del servicio, confirmas que has leído, entendido y aceptado estos Términos y Condiciones y nuestra{' '}
            <Link href="/legal/privacidad" className="text-emerald-700 font-medium underline underline-offset-2 hover:text-emerald-800 transition-colors">
              Política de Privacidad
            </Link>
            .
          </P>
          <P>
            Si no estás de acuerdo con alguna de estas condiciones, por favor no uses el servicio.
          </P>

          <SectionHeader n={3} id="requisitos">Requisitos de uso</SectionHeader>
          <P>Para usar Salto debes cumplir con los siguientes requisitos:</P>
          <UL items={[
            'Ser mayor de 16 años. Si tienes entre 16 y 18 años, necesitas autorización expresa de tu representante legal.',
            'Proporcionar información verídica, completa y actualizada durante el registro y la entrevista.',
            'Empresas: estar legalmente constituidas en Colombia o en proceso de constitución, y proporcionar datos fiscales válidos (NIT o equivalente).',
            'No suplantar a otra persona o entidad.',
            'No usar el servicio con fines ilegales o para causar daño a otros usuarios.',
          ]} />

          <SectionHeader n={4} id="cuenta">Tu cuenta</SectionHeader>
          <P>
            Eres el único responsable de mantener la confidencialidad de tus credenciales de acceso y de todas las actividades que ocurran bajo tu cuenta. Si sospechas de acceso no autorizado, notifícanos inmediatamente a{' '}
            <a href="mailto:legal@salto.app" className="text-emerald-700 font-medium hover:text-emerald-800 transition-colors">
              legal@salto.app
            </a>
            .
          </P>
          <P>
            Nos reservamos el derecho de suspender o eliminar cuentas que proporcionen información falsa, que violen estos términos, o que generen daño a otros usuarios o a la plataforma.
          </P>

          <SectionHeader n={5} id="contenido">Contenido y propiedad intelectual</SectionHeader>
          <P>
            <strong className="text-slate-900">Tu contenido es tuyo.</strong> Tu perfil, historial, respuestas a la entrevista y datos personales te pertenecen. Al subirlos, nos otorgas una licencia limitada, no exclusiva y revocable para procesarlos con el único fin de operar el servicio (matching, generación de CV, mejora del motor de IA). No vendemos tu contenido a terceros.
          </P>
          <P>
            <strong className="text-slate-900">Propiedad de Salto.</strong> El nombre "Salto", el logo, la metodología del ICS, el código fuente de la plataforma y todos los modelos de IA desarrollados internamente son propiedad exclusiva de Salto SAS. No puedes copiar, modificar, distribuir o hacer ingeniería inversa de ningún componente de la plataforma sin autorización escrita.
          </P>

          <SectionHeader n={6} id="ia">Motor de IA y limitaciones</SectionHeader>
          <Callout>
            <strong>Importante:</strong> El ICS es un sistema de priorización orientativo, no un veredicto de contratación ni una evaluación laboral con validez jurídica.
          </Callout>
          <P>
            El Índice de Compatibilidad Salto (ICS) se calcula usando modelos de lenguaje de inteligencia artificial (Google Gemini) y técnicas de similitud semántica. Sus resultados están diseñados para ayudar a las empresas a priorizar candidatos, no para reemplazar el criterio humano en las decisiones de contratación.
          </P>
          <UL items={[
            'Las decisiones de contratación son responsabilidad exclusiva del empleador.',
            'Los modelos de IA pueden cometer errores; no bases decisiones críticas únicamente en los resultados del motor.',
            'Un ICS alto no garantiza éxito en el rol; un ICS bajo no descarta al candidato.',
            'Salto no garantiza que el servicio de IA esté disponible de forma ininterrumpida.',
          ]} />

          <SectionHeader n={7} id="microtareas">Microtareas</SectionHeader>
          <P>
            Las microtareas son acuerdos de trabajo directo entre jóvenes usuarios y empresas usuarias. <strong className="text-slate-900">Salto facilita la plataforma, pero no es parte del acuerdo laboral ni comercial</strong> entre las partes.
          </P>
          <UL items={[
            'Los términos, entregables y pagos de cada microtarea son acordados directamente entre joven y empresa.',
            'Salto no garantiza el pago de ninguna microtarea ni actúa como intermediario financiero.',
            'Salto no arbitra disputas económicas entre usuarios, aunque podemos suspender cuentas que incumplan sistemáticamente sus compromisos.',
            'El joven es responsable de cumplir los entregables acordados en el plazo establecido.',
          ]} />

          <SectionHeader n={8} id="responsabilidad">Limitación de responsabilidad</SectionHeader>
          <P>
            En la máxima medida permitida por la legislación colombiana, Salto no será responsable por daños indirectos, incidentales, especiales, consecuentes o punitivos derivados del uso o la imposibilidad de uso del servicio, incluyendo pérdida de datos, pérdida de ingresos o daños a la reputación.
          </P>
          <P>
            Nuestra responsabilidad máxima frente a cualquier reclamación no excederá el valor total pagado por el usuario a Salto durante los tres (3) meses anteriores al evento que originó la reclamación, o cincuenta mil pesos colombianos (COP $50.000) si el servicio fue gratuito.
          </P>

          <SectionHeader n={9} id="modificaciones">Modificaciones de los términos</SectionHeader>
          <P>
            Podemos modificar estos Términos en cualquier momento. Cuando los cambios sean materiales, te notificaremos con al menos <strong className="text-slate-900">30 días de anticipación</strong> al correo asociado a tu cuenta.
          </P>
          <P>
            El uso continuado del servicio después de la fecha de vigencia de los nuevos términos constituye aceptación de los mismos. Si no aceptas los cambios, puedes eliminar tu cuenta antes de que entren en vigor escribiéndonos a{' '}
            <a href="mailto:legal@salto.app" className="text-emerald-700 font-medium hover:text-emerald-800 transition-colors">
              legal@salto.app
            </a>
            .
          </P>

          <SectionHeader n={10} id="contacto">Contacto y ley aplicable</SectionHeader>
          <P>
            Estos Términos se rigen e interpretan de acuerdo con las leyes de la República de Colombia. Cualquier controversia será resuelta ante los jueces competentes de Barranquilla, Atlántico, Colombia.
          </P>
          <P>Para consultas legales, solicitudes o notificaciones:</P>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 my-5 space-y-1 text-sm text-slate-700">
            <div><strong className="text-slate-900">Salto SAS</strong></div>
            <div>Barranquilla, Atlántico, Colombia</div>
            <div>
              Email:{' '}
              <a href="mailto:legal@salto.app" className="text-emerald-700 font-medium hover:text-emerald-800 transition-colors">
                legal@salto.app
              </a>
            </div>
          </div>

          {/* Separator */}
          <div className="mt-14 pt-8 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-xs text-slate-400">
              Versión 1.0 · Vigente desde el 1 de mayo de 2026
            </p>
            <Link
              href="/legal/privacidad"
              className="inline-flex items-center gap-1.5 text-sm text-emerald-700 font-semibold hover:text-emerald-800 transition-colors"
            >
              Leer Política de Privacidad <ArrowRight size={13} />
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
