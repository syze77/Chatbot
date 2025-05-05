const sequelize = require ('src/models/connections/connection.js')
const {DataTypes} = require ('sequelize');

const Call = sequelize.define(
    'Call',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        position: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        status: {
            type: DataTypes.ENUM('PENDING', 'ACTIVE', 'WAITING', 'COMPLETED'),
            allowNull: false,
        },
        createDate: {
            type: DataTypes.DATE,
        },
        dateTimeFinish: {
            type: DataTypes.DATE,
        },
        rating: {
            type: DataTypes.INTEGER,
            validate: {
                min: 1,
                max: 5
            }
        },
    },
);

Call.associate = (models) => {
    Call.belongsTo(models.User);
    Call.belongsTo(models.Card);
    Call.belongsTo(models.Attendant);
};

module.exports = Call;