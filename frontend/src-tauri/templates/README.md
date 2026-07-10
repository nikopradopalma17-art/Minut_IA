# Meeting Summary Templates

This directory contains template definitions for meeting summary generation.

## Available Templates

### 1. `reunion_diaria.json`
Plantilla breve para seguimiento diario del equipo.

**Sections:**
- Fecha
- Participantes
- Ayer
- Hoy
- Bloqueos
- Notas

### 2. `minuta_corporativa.json`
Plantilla corporativa para minutas ejecutivas con acuerdos y compromisos accionables.

**Sections:**
- Resumen ejecutivo
- Fecha
- Participantes
- Temas tratados
- Acuerdos
- Decisiones tomadas
- Compromisos
- Próximas acciones

### 3. `reunion_cliente.json`
Plantilla para reuniones comerciales, demos y llamadas con clientes.

**Sections:**
- Contexto
- Asistentes
- Necesidades detectadas
- Demos y materiales compartidos
- Objeciones y riesgos
- Próximos pasos

## Template Structure

Each template JSON file follows this schema:

```json
{
  "name": "Template Name",
  "description": "Brief description of the template's purpose",
  "system_prompt": "Optional system-level instructions",
  "sections": [
    {
      "title": "Section Title",
      "instruction": "Instructions for the LLM on what to extract/include",
      "format": "paragraph|list|string",
      "item_format": "Optional: Markdown table format for list items",
      "example_item_format": "Optional alternative format"
    }
  ]
}
```

## Custom Templates

Users can add custom templates to the application data directory:

- **macOS**: `~/Library/Application Support/MinutIA/templates/`
- **Windows**: `%APPDATA%\MinutIA\templates\`
- **Linux**: `~/.config/MinutIA/templates/`

Custom templates override built-in templates with the same filename.

## Template Fields

### Root Level
- `name` (required): Display name for the template
- `description` (required): Brief explanation of the template's use case
- `system_prompt` (optional): Extra instructions injected before the section instructions
- `sections` (required): Array of section definitions

### Section Object
- `title` (required): Section heading text
- `instruction` (required): LLM guidance for this section
- `format` (required): One of `"paragraph"`, `"list"`, or `"string"`
- `item_format` (optional): Markdown formatting hint for list items (e.g., table structure)
- `example_item_format` (optional): Alternative formatting hint

## Usage in Code

Templates are loaded using the `templates` module:

```rust
use crate::summary::templates;

// Get a specific template
let template = templates::get_template("minuta_corporativa")?;

// List available templates
let available = templates::list_templates();

// Validate custom template JSON
let custom_json = std::fs::read_to_string("custom.json")?;
let validated = templates::validate_template(&custom_json)?;
```
