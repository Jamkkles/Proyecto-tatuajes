# Compila tesis/main.tex cada vez que lo guardas, sin depender de VS Code.
#
# Uso:   cd tesis ; .\vigilar.ps1
# Parar: Ctrl+C
#
# Solo usa MiKTeX (pdflatex y biber). No necesita Perl, asi que no sirve
# latexmk en este equipo.
#
# -Completa  hace la cadena entera (pdflatex -> biber -> pdflatex x2), que es
#            la que cuadra indice, referencias y bibliografia. Sin ella cada
#            guardado hace una sola pasada, que es mucho mas rapida.

param([switch]$Completa)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Compilar {
    param([switch]$Todo)

    $inicio = Get-Date
    Write-Host ''
    Write-Host ("[{0}] compilando..." -f $inicio.ToString('HH:mm:ss')) -ForegroundColor Cyan

    pdflatex -synctex=1 -interaction=nonstopmode -file-line-error main.tex | Out-Null
    $codigo = $LASTEXITCODE

    if ($Todo -and $codigo -eq 0) {
        biber main | Out-Null
        pdflatex -synctex=1 -interaction=nonstopmode -file-line-error main.tex | Out-Null
        pdflatex -synctex=1 -interaction=nonstopmode -file-line-error main.tex | Out-Null
        $codigo = $LASTEXITCODE
    }

    $segundos = [int]((Get-Date) - $inicio).TotalSeconds

    if ($codigo -eq 0) {
        $paginas = Select-String -Path main.log -Pattern 'Output written on .*\((\d+) pages' |
                   Select-Object -Last 1
        $detalle = if ($null -ne $paginas) { "$($paginas.Matches[0].Groups[1].Value) paginas" } else { 'listo' }
        Write-Host ("    main.pdf actualizado ({0}, {1} s)" -f $detalle, $segundos) -ForegroundColor Green
    }
    else {
        Write-Host ("    fallo la compilacion ({0} s). Errores:" -f $segundos) -ForegroundColor Red
        Select-String -Path main.log -Pattern '^(main\.tex|\.\/|!)' |
            Select-Object -First 8 |
            ForEach-Object { Write-Host ("      " + $_.Line) -ForegroundColor Red }
        Write-Host '      (el detalle completo esta en tesis/main.log)' -ForegroundColor DarkGray
    }
}

Write-Host 'Vigilando main.tex y portada.tex. Guarda con Ctrl+S y se compila solo.' -ForegroundColor Yellow
Write-Host 'Ctrl+C para parar.' -ForegroundColor DarkGray

$vigilados = @('main.tex', 'portada.tex', 'bibliografia.bib')

function Firma {
    ($vigilados | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object {
        $f = Get-Item -LiteralPath $_
        "$($f.Name):$($f.LastWriteTimeUtc.Ticks):$($f.Length)"
    }) -join '|'
}

$anterior = Firma
Compilar -Todo:$Completa

while ($true) {
    Start-Sleep -Seconds 2
    $actual = Firma
    if ($actual -ne $anterior) {
        # Espera a que el editor termine de escribir el archivo.
        Start-Sleep -Milliseconds 400
        $anterior = Firma
        Compilar -Todo:$Completa
    }
}
