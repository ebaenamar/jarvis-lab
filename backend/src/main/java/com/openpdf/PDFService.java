package com.openpdf;

import com.lowagie.text.Document;
import com.lowagie.text.pdf.PdfCopy;
import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.PdfStamper;
import org.springframework.stereotype.Service;

import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;

@Service
public class PDFService {

    public void deletePage(String input, int page) {
        try {
            PdfReader reader = new PdfReader(input);
            String output = "uploads/edited.pdf";
            PdfStamper stamper = new PdfStamper(reader, new FileOutputStream(output));
            reader.selectPages("1-" + (page - 1) + "," + (page + 1) + "-" + reader.getNumberOfPages());
            stamper.close();
            reader.close();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    // Handles reorder AND delete: "order" is the list of original page numbers
    // to keep, in the order they should appear. Omit a page number to delete it.
    public String applyPageOrder(String inputPath, List<Integer> order) {
        try {
            PdfReader reader = new PdfReader(inputPath);
            String outputPath = "uploads/edited_" + System.currentTimeMillis() + ".pdf";
            Document document = new Document();
            PdfCopy copy = new PdfCopy(document, new FileOutputStream(outputPath));
            document.open();
            for (int pageNum : order) {
                copy.addPage(copy.getImportedPage(reader, pageNum));
            }
            document.close();
            reader.close();
            return outputPath;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    // splitPoints = starting page number of each new file after the first
    // e.g. 10-page doc, splitPoints=[4,7] -> files: [1-3], [4-6], [7-10]
    public List<String> splitPdf(String inputPath, List<Integer> splitPoints) {
        try {
            PdfReader reader = new PdfReader(inputPath);
            int totalPages = reader.getNumberOfPages();

            List<Integer> boundaries = new ArrayList<>();
            boundaries.add(1);
            boundaries.addAll(splitPoints);
            boundaries.add(totalPages + 1);

            List<String> outputPaths = new ArrayList<>();
            for (int i = 0; i < boundaries.size() - 1; i++) {
                int start = boundaries.get(i);
                int end = boundaries.get(i + 1) - 1;

                String outputPath = "uploads/split_" + (i + 1) + "_" + System.currentTimeMillis() + ".pdf";
                Document document = new Document();
                PdfCopy copy = new PdfCopy(document, new FileOutputStream(outputPath));
                document.open();
                for (int p = start; p <= end; p++) {
                    copy.addPage(copy.getImportedPage(reader, p));
                }
                document.close();
                outputPaths.add(outputPath);
            }
            reader.close();
            return outputPaths;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}