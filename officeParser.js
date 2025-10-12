import officeParser from 'officeparser';

const filename = "./files/588-341.pptx";
// const filename = "./files/English CCT KIT 2014.pdf";
// const filename = "./files/TC_AT_KIT_2012.txt";

// callback
// officeParser.parseOffice(filename, function(data, err) {
//     // "data" string in the callback here is the text parsed from the office file passed in the first argument above
//     if (err) {
//         console.log(err);
//         return;
//     }
//     console.log(data);
// })
/**
 * Parses an office document (.pptx, .pdf, .docx, .txt)
 * @param {string} filename - Path to the file
 * @returns {Promise<string>} - Extracted text from the file
 */
const parseOfficeFile = (filename) => {
  return new Promise((resolve, reject) => {
    officeParser.parseOffice(filename, (data, err) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

export default parseOfficeFile;