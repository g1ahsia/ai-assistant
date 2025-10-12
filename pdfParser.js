import fs from "fs";
import PDFParser from "pdf2json"; 

const pdfParser = new PDFParser();

pdfParser.on("pdfParser_dataError", (errData) =>
 console.error(errData.parserError)
);
pdfParser.on('pdfParser_dataReady', pdfData => {
    // This logs the entire parsed PDF structure
    console.log(JSON.stringify(pdfData, null, 2));

    // Loop through each page's text content and print the text arrays
    pdfData.Pages.forEach((page, pageIndex) => {
        console.log(`Page ${pageIndex + 1} Texts:`);
        page.Texts.forEach((textItem, index) => {
            console.log(`Text ${index + 1}: ${decodeURIComponent(textItem.R[0].T)}`);
        });
    });
});

pdfParser.loadPDF("./files/English CCT KIT 2014.pdf");
