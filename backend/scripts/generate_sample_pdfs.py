"""Generate multi-subject demo PDFs for Kiko offline RAG and document reading."""

import os
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

OUT_DIR = Path(__file__).resolve().parent.parent.parent / "sample_docs"
OUT_DIR.mkdir(parents=True, exist_ok=True)

styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    "DocTitle",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=22,
    leading=26,
    textColor=colors.HexColor("#1e1b4b"),
    alignment=0,
)

h1_style = ParagraphStyle(
    "DocH1",
    parent=styles["Heading1"],
    fontName="Helvetica-Bold",
    fontSize=14,
    leading=18,
    textColor=colors.HexColor("#4338ca"),
    spaceBefore=12,
    spaceAfter=6,
)

body_style = ParagraphStyle(
    "DocBody",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=10,
    leading=14,
    textColor=colors.HexColor("#1e293b"),
    spaceAfter=6,
)

bullet_style = ParagraphStyle(
    "DocBullet",
    parent=body_style,
    leftIndent=15,
    firstLineIndent=-10,
    spaceAfter=4,
)

def make_pdf(filename: str, title: str, category: str, sections: list[tuple[str, list[str]]]):
    filepath = OUT_DIR / filename
    doc = SimpleDocTemplate(str(filepath), pagesize=letter, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
    story = []

    # Header
    story.append(Paragraph(f"<font color='#6366f1'><b>SUBJECT: {category.upper()}</b></font>", body_style))
    story.append(Paragraph(title, title_style))
    story.append(Paragraph("<i>Prepared for Offline AI Knowledge Ingestion & RAG Verification</i>", body_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#6366f1"), spaceBefore=8, spaceAfter=14))

    for sec_title, paragraphs in sections:
        story.append(Paragraph(sec_title, h1_style))
        for p in paragraphs:
            if p.startswith("•") or p.startswith("-"):
                story.append(Paragraph(p, bullet_style))
            else:
                story.append(Paragraph(p, body_style))
        story.append(Spacer(1, 8))

    doc.build(story)
    print(f"Generated: {filepath} ({os.path.getsize(filepath)} bytes)")

# 1. Computer Science & AI Architecture
make_pdf(
    "Artificial_Intelligence_Architecture.pdf",
    "Local AI Systems: Neural Architectures & Edge Runtime",
    "Computer Science / Artificial Intelligence",
    [
        ("1. Executive Summary", [
            "Local artificial intelligence decouples neural computation from remote cloud servers. By executing models on local silicon using quantized weight formats and lightweight runtimes, edge systems guarantee zero telemetry, microsecond network latency, and complete user privacy.",
        ]),
        ("2. Component Pipeline", [
            "• <b>Neural Text-to-Speech (TTS):</b> Kokoro-82M ONNX model operating at 24kHz float32 audio. Delivers 54 distinct multilingual voice styles with sub-100ms first-packet generation.",
            "• <b>Speech Recognition (STT):</b> Faster-Whisper small INT8 quantization with CPU-level Voice Activity Detection (VAD) and token timestamps.",
            "• <b>Dual-Brain Language Model:</b> Dynamic switching between Qwen3-0.6B (sub-1.5s real-time voice conversations) and Qwen3-1.7B (deep multi-step coding, mathematical reasoning, and document analysis).",
            "• <b>Local Vector RAG:</b> In-memory TF-IDF and cosine similarity embeddings chunking local documents into 350-word passages with source attribution.",
        ]),
        ("3. Comparative Latency & Security Analysis", [
            "Centralized cloud APIs exhibit typical round-trip latencies between 600ms and 2500ms due to TLS negotiation, payload serialization, and queueing. In contrast, local inference maintains zero transport overhead, eliminating man-in-the-middle vulnerabilities and subscription costs.",
        ]),
    ]
)

# 2. Physics & Quantum Computing
make_pdf(
    "Quantum_Computing_Principles.pdf",
    "Quantum Mechanics & Computational Architectures",
    "Physics / Advanced Computing",
    [
        ("1. Fundamental Quantum Principles", [
            "Unlike classical binary systems where information is encoded in discrete bits (0 or 1), quantum computation harnesses state vectors within a two-dimensional Hilbert space known as qubits.",
            "• <b>Superposition:</b> A qubit can exist in a linear combination of states |ψ⟩ = α|0⟩ + β|1⟩, where |α|² + |β|² = 1.",
            "• <b>Entanglement:</b> Non-local correlation where the quantum state of a multi-particle system cannot be factored into product states of individual components.",
            "• <b>Quantum Interference:</b> Constructive interference amplifies the probability amplitudes of correct solution states, while destructive interference cancels erroneous paths.",
        ]),
        ("2. Quantum Algorithms & Supremacy", [
            "• <b>Shor's Algorithm:</b> Solves prime factorization in polynomial time O((log N)³), presenting a theoretical threat to RSA-based public key cryptosystems.",
            "• <b>Grover's Algorithm:</b> Provides quadratic speedup O(√N) for unstructured database search operations.",
            "• <b>Surface Codes:</b> Fault-tolerant quantum error correction encoding a single logical qubit across an array of physical qubits with threshold error rates below 1%.",
        ]),
    ]
)

# 3. Biology & Genetics
make_pdf(
    "Human_Biology_and_Genetics.pdf",
    "Molecular Genetics, DNA Replication & Cellular Pathways",
    "Life Sciences / Human Biology",
    [
        ("1. Nucleic Acid Structure & Genetic Code", [
            "Deoxyribonucleic acid (DNA) is an antiparallel double helix composed of nucleotide monomers: adenine (A), thymine (T), guanine (G), and cytosine (C). Base pairing rules dictate that adenine pairs with thymine via two hydrogen bonds, while guanine pairs with cytosine via three hydrogen bonds.",
        ]),
        ("2. The Central Dogma of Molecular Biology", [
            "• <b>Transcription:</b> RNA Polymerase II synthesizes messenger RNA (mRNA) from the template DNA strand in the 5' to 3' direction.",
            "• <b>RNA Processing:</b> Pre-mRNA undergoes 5' capping (7-methylguanosine), 3' polyadenylation (poly-A tail), and spliceosomal excision of non-coding introns.",
            "• <b>Translation:</b> Ribosomal complexes read triplet codons on the mature mRNA to assemble polypeptide chains using aminoacyl-tRNA molecules.",
        ]),
        ("3. CRISPR-Cas9 Gene Editing", [
            "Clustered Regularly Interspaced Short Palindromic Repeats (CRISPR) combined with the Cas9 endonuclease enables targeted double-strand breaks guided by synthetic single-guide RNA (sgRNA). Repair occurs via non-homologous end joining (NHEJ) or homology-directed repair (HDR).",
        ]),
    ]
)

# 4. Space Science & Mars Missions
make_pdf(
    "Space_Exploration_and_Mars_Mission.pdf",
    "Mars Planetary Science & Autonomous Exploration Missions",
    "Astronomy / Planetary Science",
    [
        ("1. Martian Atmospheric & Geological Characteristics", [
            "Mars possesses a thin atmosphere composed of 95.3% carbon dioxide, 2.6% nitrogen, and 1.9% argon, with an average surface atmospheric pressure of 610 Pascals (less than 1% of Earth's sea-level pressure). Surface temperatures range from -125°C at the winter poles to 20°C during equatorial summer.",
        ]),
        ("2. Surface Exploration & Biosignature Detection", [
            "• <b>Perseverance Rover:</b> Equipped with the SHERLOC ultraviolet Raman spectrometer and PIXL X-ray fluorescence system to identify organic molecules and biosignatures in Jezero Crater.",
            "• <b>MOXIE Experiment:</b> Successfully produced breathable oxygen (O₂) on Mars by solid oxide electrolysis of atmospheric carbon dioxide at 800°C.",
            "• <b>Sample Return Architecture:</b> Joint NASA/ESA mission profile utilizing an Earth Return Orbiter and Mars Ascent Vehicle to return hermetically sealed core samples to Earth.",
        ]),
    ]
)
print("All 4 sample subject PDFs successfully generated!")
