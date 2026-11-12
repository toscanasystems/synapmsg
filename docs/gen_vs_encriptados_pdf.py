#!/usr/bin/env python3
"""Generate Synapmsg vs encrypted-phones CLN comparison PDF."""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor, white
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
import os

OUT = os.path.join(
    os.path.dirname(__file__),
    "synapmsg-vs-telefonos-encriptados-cln.pdf",
)

TEAL = HexColor("#30B0B0")
DARK = HexColor("#0A0A0A")
GRAY = HexColor("#444444")
LIGHT = HexColor("#F5F5F5")
BORDER = HexColor("#DDDDDD")


def main() -> None:
    doc = SimpleDocTemplate(
        OUT,
        pagesize=letter,
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.6 * cm,
        title="Synapmsg vs telefonos encriptados CLN",
        author="Toscana Systems, S.A. / Synapmsg",
    )

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="Brand",
            fontName="Helvetica-Bold",
            fontSize=22,
            textColor=TEAL,
            spaceAfter=4,
            alignment=TA_CENTER,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Sub",
            fontName="Helvetica",
            fontSize=10,
            textColor=GRAY,
            spaceAfter=12,
            alignment=TA_CENTER,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H1",
            fontName="Helvetica-Bold",
            fontSize=13,
            textColor=DARK,
            spaceBefore=14,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Body",
            fontName="Helvetica",
            fontSize=10,
            textColor=DARK,
            leading=14,
            alignment=TA_JUSTIFY,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BulletItem",
            fontName="Helvetica",
            fontSize=9.5,
            textColor=DARK,
            leading=13,
            leftIndent=10,
            spaceAfter=3,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Verdict",
            fontName="Helvetica-Bold",
            fontSize=10.5,
            textColor=DARK,
            leading=14,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Cell",
            fontName="Helvetica",
            fontSize=8,
            textColor=DARK,
            leading=11,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CellB",
            fontName="Helvetica-Bold",
            fontSize=8,
            textColor=DARK,
            leading=11,
        )
    )
    styles.add(
        ParagraphStyle(
            name="HeadCell",
            fontName="Helvetica-Bold",
            fontSize=8,
            textColor=white,
            leading=11,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Foot",
            fontName="Helvetica",
            fontSize=8,
            textColor=GRAY,
            alignment=TA_CENTER,
            spaceBefore=16,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Note",
            fontName="Helvetica-Oblique",
            fontSize=8.5,
            textColor=GRAY,
            leading=12,
            spaceAfter=8,
        )
    )

    def cell(t: str, bold: bool = False):
        return Paragraph(t, styles["CellB"] if bold else styles["Cell"])

    def head(t: str):
        return Paragraph(t, styles["HeadCell"])

    story = []
    story.append(Paragraph("Synapmsg", styles["Brand"]))
    story.append(
        Paragraph(
            "Evaluacion: telefonos / radios encriptados (Culiacan) vs APK Synapmsg",
            styles["Sub"],
        )
    )
    story.append(HRFlowable(width="100%", thickness=2, color=TEAL, spaceAfter=12))

    story.append(Paragraph("Veredicto", styles["H1"]))
    story.append(
        Paragraph(
            "<b>Esa linea de producto vende hardware + ROM/VPN + mensajeria "
            "cerrada (+ a veces PTT/radio).</b> Synapmsg <b>si puede sustituir "
            "la capa de mensajeria y seguridad de software</b> con criptografia "
            "abierta y auditable. <b>No</b> sustituye radios RF ni un telefono "
            "modificado de fabrica.",
            styles["Verdict"],
        )
    )

    story.append(Paragraph("Alcance de la evaluacion", styles["H1"]))
    story.append(
        Paragraph(
            "Referencia de mercado: cuentas/tiendas del vertical en Culiacan "
            "(p. ej. radiosclnencriptados / Encriptados CLN / Criptophone). "
            "Claims publicos tipicos: sistema encriptado, VPN privada, cambio "
            "de ubicacion, anti-chupon, doble perfil, carpeta oculta, borrado "
            "de emergencia, mensajeria privada/PTT, doble SIM, detectores RF. "
            "Precios de referencia del vertical: aprox. $8,000-$18,000 MXN "
            "por equipo.",
            styles["Body"],
        )
    )
    story.append(
        Paragraph(
            "Nota: en Culiacan ha habido clausuras de locales similares por la "
            "FGR. El vertical es opaco y legalmente fragil; esta nota es "
            "analisis tecnico de producto para posicionamiento de Synapmsg, "
            "no un endoso de ese mercado.",
            styles["Note"],
        )
    )

    story.append(Paragraph("Que venden en la practica", styles["H1"]))
    data1 = [
        [head("Claim"), head("Que es de verdad"), head("Nivel")],
        [
            cell("Sistema encriptado", True),
            cell("ROM/custom + apps propietarias; sin auditoria publica"),
            cell("Bajo-medio; riesgo backdoor vendor"),
        ],
        [
            cell("VPN privada", True),
            cell("Tunel IP"),
            cell("Oculta IP; no cifra chats E2E"),
        ],
        [
            cell("Cambio de ubicacion", True),
            cell("Spoof GPS"),
            cell("No engaña celda/IMSI"),
        ],
        [
            cell("Anti-chupon", True),
            cell("Marketing (SSL/VoIP/alertas)"),
            cell("Carrier sigue viendo metadatos"),
        ],
        [
            cell("Doble perfil / carpeta", True),
            cell("Second Space / work profile"),
            cell("Ocultacion UX"),
        ],
        [
            cell("Borrado emergencia", True),
            cell("Wipe local/remoto"),
            cell("Comparable a remote wipe"),
        ],
        [
            cell("Mensajeria / PTT", True),
            cell("App cerrada o radio+IP"),
            cell("Caja negra; sin KTL/PQ"),
        ],
        [
            cell("Radio RF / PTT HW", True),
            cell("RF o PTT propietario"),
            cell("Otro producto (sin internet)"),
        ],
    ]
    t1 = Table(data1, colWidths=[3.8 * cm, 7.2 * cm, 5.5 * cm])
    t1.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), TEAL),
                ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, LIGHT]),
            ]
        )
    )
    story.append(t1)
    story.append(Spacer(1, 10))

    story.append(Paragraph("Synapmsg vs ese telefono", styles["H1"]))
    data2 = [
        [head("Capacidad"), head("Telefono encriptado CLN"), head("Synapmsg APK")],
        [
            cell("E2E auditable + PQ", True),
            cell("No demostrado"),
            cell("Si (synapmsg-pq-v1 + ML-KEM)"),
        ],
        [
            cell("Servidor sin plaintext E2E", True),
            cell("Desconocido"),
            cell("Si"),
        ],
        [cell("Key Transparency (KTL)", True), cell("No"), cell("Si")],
        [
            cell("Wipe + duress/senuelo", True),
            cell("Si (opaco)"),
            cell("Si (Ed25519 verificado)"),
        ],
        [
            cell("Chats ocultos PIN", True),
            cell("Parcial (carpeta)"),
            cell("Si"),
        ],
        [
            cell("Private Number sin SIM", True),
            cell("No tipico"),
            cell("Si"),
        ],
        [cell("FIDO2 / recovery", True), cell("Raro"), cell("Si")],
        [
            cell("VPN / anti-censura red", True),
            cell("Si (claim)"),
            cell("Aun aspiracional"),
        ],
        [
            cell("Sin Google / ROM custom", True),
            cell("Algunos modelos"),
            cell("No (Android normal)"),
        ],
        [
            cell("Radio RF / PTT hardware", True),
            cell("Si en algunos"),
            cell("No"),
        ],
        [
            cell("Detectores RF GPS/cam/mic", True),
            cell("Accesorio fisico"),
            cell("No"),
        ],
        [
            cell("Precio", True),
            cell("~$8k-$18k MXN equipo"),
            cell("App en telefono propio"),
        ],
    ]
    t2 = Table(data2, colWidths=[5.2 * cm, 5.6 * cm, 5.7 * cm])
    t2.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), TEAL),
                ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, LIGHT]),
            ]
        )
    )
    story.append(t2)

    story.append(Paragraph("La APK los sustituye?", styles["H1"]))
    story.append(
        Paragraph(
            "• <b>Si</b>, como sustituto del WhatsApp/Telegram encriptado + wipe "
            "+ perfiles ocultos: en crypto abierta Synapmsg es <b>mas fuerte</b> "
            "que un sistema cerrado sin auditoria.",
            styles["BulletItem"],
        )
    )
    story.append(
        Paragraph(
            "• <b>No</b>, como sustituto del aparato completo: no reemplaza "
            "radio VHF/UHF/DMR, PTT hardware, dual-SIM de fabrica, ROM sin "
            "Google ni detectores fisicos.",
            styles["BulletItem"],
        )
    )
    story.append(
        Paragraph(
            "• <b>Riesgo de ellos:</b> la seguridad depende del vendedor "
            "(updates, claves, PTT). Si el vendor es comprometido o cooperativo, "
            "cae el telefono entero. Synapmsg apunta a lo contrario: protocolo "
            "abierto, minimo metadato, E2E real.",
            styles["BulletItem"],
        )
    )

    story.append(Paragraph("Posicionamiento LatAm (recomendacion)", styles["H1"]))
    story.append(
        Paragraph(
            'No competir como "otro celular encriptado de $15k". Competir como: '
            "<b>cualquier Android + Synapmsg = mensajeria de seguridad absoluta "
            "sin caja negra</b>. Dejar radios/PTT RF fuera del scope "
            "(o futuro ecosistema bots/PTT IP, no RF).",
            styles["Body"],
        )
    )

    story.append(
        HRFlowable(width="100%", thickness=1, color=TEAL, spaceBefore=10, spaceAfter=8)
    )
    story.append(
        Paragraph(
            "Toscana Systems, S.A. · Synapmsg · Documento interno / reenvio "
            "comercial-tecnico · https://synapmsg.ai",
            styles["Foot"],
        )
    )

    doc.build(story)
    print(OUT)
    print("bytes", os.path.getsize(OUT))


if __name__ == "__main__":
    main()
