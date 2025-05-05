const sequelize = require ('src/models/connections/connection.js')
const {DataTypes} = require ('sequelize');

const Attendant = sequelize.define(
    'Attendant',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
    },
);

Attendant.associate = (models) => {
    Attendant.hasMany(models.Call);
};

module.exports = Attendant;