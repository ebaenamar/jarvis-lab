package com.openpdf;


import com.lowagie.text.pdf.*;
import org.springframework.stereotype.Service;

import java.io.FileOutputStream;


@Service
public class PDFService {



    public void deletePage(
            String input,
            int page
    ){

        try {


            PdfReader reader =
                    new PdfReader(input);


            String output =
                    "uploads/edited.pdf";


            PdfStamper stamper =
                    new PdfStamper(
                            reader,
                            new FileOutputStream(output)
                    );


            reader.selectPages(
                    "1-" + (page-1)
                    + "," +
                    (page+1) + "-"
                    + reader.getNumberOfPages()
            );


            stamper.close();
            reader.close();



        } catch(Exception e){

            throw new RuntimeException(e);

        }

    }

}