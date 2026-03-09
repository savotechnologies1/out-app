exports.getDatesBetween = (start, end) => {
    const dates = [];
    const d = new Date(start);
    d.setHours(0, 0, 0, 0);

    while (d < end) {
        dates.push(new Date(d));
        d.setDate(d.getDate() + 1);
    }

    return dates;
};