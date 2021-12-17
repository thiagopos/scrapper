var first = [ 1, 2, 3, 4, 5 ];
var second = [ 4, 5, 6 ];
 
var difference = first.filter(x => !second.includes(x));
console.log(difference);
 
/*
    Output: [ 1, 2, 3]
*/