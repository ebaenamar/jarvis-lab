package com.openpdf;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertTrue;

class PDFServiceTest {

    @Test
    void htmlToPdf_createsPdfFile() throws Exception {
        PDFService service = new PDFService();
        String html = "<html><body><h1>Hello PDF</h1><p>Converted from HTML.</p></body></html>";

        String outputPath = service.htmlToPdf(html, "sample.pdf");

        assertTrue(Files.exists(Path.of(outputPath)));
        assertTrue(outputPath.endsWith(".pdf"));
        Files.deleteIfExists(Path.of(outputPath));
    }
}
